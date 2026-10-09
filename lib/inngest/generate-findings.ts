import { NonRetriableError } from 'inngest'
import { inngest } from './client'
import { DIAGNOSE_REQUESTED_EVENT, type DiagnoseRequestedEventData } from './events'
import { runProgressChannel, type RunProgressMessage } from './channels'
import { buildRuleContext } from '@/lib/diagnosis/context'
import { evaluateRulesWithLedger, type LedgerRow } from '@/lib/diagnosis/check-ledger'
import { availableSources, protocolBoundRuleIds } from '@/lib/diagnosis/sources'
import { reconcileIssues, toObservedHit, type ObservedHit } from '@/lib/issues/reconcile'
import { computeKeywordGaps, type KeywordGapResult } from '@/lib/diagnosis/keyword-gap'
import { buildCompetitorInputs, persistKeywordGaps } from '@/lib/diagnosis/competitor-context'
import {
  buildIntentPageFitArtifactPayload,
  buildIntentPageFitMap,
  type IntentPageFitArtifactPayload,
} from '@/lib/diagnosis/intent-page-fit'
import type { DiagnosisEvidenceRow, Rule, RuleHit } from '@/lib/diagnosis/types'
import { buildFindingRows, buildRecommendationRows, type RecommendationDraft } from '@/lib/diagnosis/finding-rows'
import { aggregateProbeSummary, normalizeProjectDomain } from '@/lib/probes/summary'
import { brandFromDomain } from '@/lib/probes/prompt-set'
import type { EvidenceLevel, EvidenceType } from '@/lib/types'
import {
  getRunEvidence,
  getProject,
  getRunPrompts,
  getRunProbeResults,
  createFindings,
  createRecommendations,
  markRunStatus,
  getRun,
  getRunDataSourceStatuses,
  getConfirmedCompetitors,
  upsertKeyword,
  createKeywordGaps,
  saveCheckLedger,
  getProjectIssues,
  saveIssueChanges,
  hasObservedEvents,
  recomputeRetestDue,
} from '@/lib/repositories'

interface DiagnoseStep {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

interface DiagnoseArgs {
  event: { data: DiagnoseRequestedEventData }
  step: DiagnoseStep
  publish: (msg: unknown) => Promise<void>
}

// RecommendationDraft 的真源在 '@/lib/diagnosis/finding-rows'（与 reeval 链共享）；此处 re-export 兼容既有引用。
export type { RecommendationDraft } from '@/lib/diagnosis/finding-rows'

interface GenerateFindingsDeps {
  getRunEvidence: typeof getRunEvidence
  getProject: typeof getProject
  getRunPrompts: typeof getRunPrompts
  getRunProbeResults: typeof getRunProbeResults
  createFindings: typeof createFindings
  createRecommendations: typeof createRecommendations
  markRunStatus: typeof markRunStatus
  // 问题台账（spec 2026-10-09 §5.1）：按本次数据源状态求值、写检查台账、对账问题表。
  evaluateRulesWithLedger: typeof evaluateRulesWithLedger
  getRunDataSourceStatuses: typeof getRunDataSourceStatuses
  getRun: typeof getRun
  saveCheckLedger: typeof saveCheckLedger
  getProjectIssues: typeof getProjectIssues
  saveIssueChanges: typeof saveIssueChanges
  hasObservedEvents: typeof hasObservedEvents
  recomputeRetestDue: typeof recomputeRetestDue
  // 已确认竞品 + 关键词缺口（spec §5.4-1）：主诊断与竞品确认后的再评估共用 buildCompetitorInputs。
  getConfirmedCompetitors: typeof getConfirmedCompetitors
  upsertKeyword: typeof upsertKeyword
  createKeywordGaps: typeof createKeywordGaps
  computeKeywordGaps: typeof computeKeywordGaps
  buildRuleContext: typeof buildRuleContext
  buildIntentPageFitMap: typeof buildIntentPageFitMap
  buildIntentPageFitArtifactPayload: typeof buildIntentPageFitArtifactPayload
  aggregateProbeSummary: typeof aggregateProbeSummary
  // 规则注册表与建议生成器由诊断模块（并行开发）提供。用 loader/wrapper 形态注入，
  // 使本文件在这两个模块尚未落地时也能被单测加载（fake 注入，永不走真实 import 路径）。
  allRules: () => Promise<Rule[]> | Rule[]
  generateRecommendation: (
    hit: RuleHit,
    opts: { domain: string },
  ) => Promise<RecommendationDraft | null> | RecommendationDraft | null
}

function errorReason(err: unknown, fallback = 'diagnosis_failed'): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'object' && err && 'message' in err && typeof err.message === 'string' && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return fallback
}

function defaultDeps(): GenerateFindingsDeps {
  return {
    getRunEvidence,
    getProject,
    getRunPrompts,
    getRunProbeResults,
    createFindings,
    createRecommendations,
    markRunStatus,
    getRun,
    getRunDataSourceStatuses,
    getConfirmedCompetitors,
    upsertKeyword,
    createKeywordGaps,
    computeKeywordGaps,
    evaluateRulesWithLedger,
    saveCheckLedger,
    getProjectIssues,
    saveIssueChanges,
    hasObservedEvents,
    recomputeRetestDue,
    buildRuleContext,
    buildIntentPageFitMap,
    buildIntentPageFitArtifactPayload,
    aggregateProbeSummary,
    // 动态 import：规则集/建议生成器在最终集成时落地；此处按需加载，不在模块加载期解析。
    allRules: async () => (await import('@/lib/diagnosis/rules')).allRules,
    generateRecommendation: async (hit, opts) =>
      (await import('@/lib/diagnosis/recommend')).generateRecommendation(hit, opts),
  }
}

export async function generateFindingsHandler(
  { event, step, publish }: DiagnoseArgs,
  deps: GenerateFindingsDeps = defaultDeps(),
): Promise<{ status: 'reviewing'; findings: number }> {
  const { runId, projectId } = event.data
  const channel = runProgressChannel(runId)
  const emit = async (msg: RunProgressMessage) => publish(await channel.progress(msg))

  await step.run('mark-diagnosing', () => deps.markRunStatus(runId, 'diagnosing', { failureReason: null }))
  await step.run('start-workflow-runtime', async () => {
    try {
      const { startWorkflowForRun } = await import('@/lib/knowledge/repository')
      await startWorkflowForRun(runId)
    } catch {
      // 0013 尚未迁移时保持旧诊断链可用。
    }
  })
  await emit({ type: 'phase', phase: 'diagnose' })

  // —— 规则求值 ——（读证据 + 项目 + 探针聚合 → RuleContext → RuleHit[]）。
  // 证据 rawText 可能很大：整个加载+求值裹进一个 step，只把精简的 hits/domain 出参回放，
  // 避免把全站 HTML 塞进 Inngest step 状态往返序列化。
  const { hits, ledger, protocolBound, domain, intentPageFit, gaps, serpEvidenceId, market, language } = await step.run('run-rules', async () => {
    const project = await deps.getProject(projectId)
    if (!project) throw new NonRetriableError(`project_not_found:${projectId}`)

    const [evidenceRaw, prompts, probeResults, confirmed, sourceStatuses] = await Promise.all([
      deps.getRunEvidence(runId),
      deps.getRunPrompts(runId),
      deps.getRunProbeResults(runId),
      deps.getConfirmedCompetitors(projectId),
      deps.getRunDataSourceStatuses(runId),
    ])

    const evidence: DiagnosisEvidenceRow[] = evidenceRaw.map((e) => ({
      id: e.id,
      type: e.type as EvidenceType,
      claimLevel: e.claimLevel as EvidenceLevel,
      source: e.source,
      payload: e.payload,
      rawText: e.rawText,
      sitePageId: e.sitePageId,
    }))

    // 已确认竞品 → 竞品类规则（Q01–Q03、K03、K04、E03）的输入；此前只在竞品页点「确认」触发的
    // 再评估里才有，主诊断每次都空转（spec §5.4-1）。
    const competitorInputs = buildCompetitorInputs({
      evidence,
      confirmed,
      projectDomain: project.domain,
      projectCompetitors: project.competitors ?? [],
      computeKeywordGaps: deps.computeKeywordGaps,
    })
    // 仅探针 SoV 聚合用「手填 ∪ 已确认名」；规则上下文的 project.competitors 仍是手填集。
    const competitors = competitorInputs.probeCompetitors
    // 原始回答文本按 evidenceId 归档，供聚合期对竞品集重解析（SP-A2 #6）。
    const answerByEvidence = new Map(
      evidence.map((e) => [e.id, (e.payload as { answerText?: string } | null)?.answerText]),
    )
    const probe = deps.aggregateProbeSummary({
      // D1（GEO branded/unbranded 重设计）：透传 prompts.branded，供聚合层拆 unbranded 头条指标
      // /branded 三态判定；不传会被聚合层兜底成「全部 unbranded」，规则层 G05/G10 会失真。
      prompts: prompts.map((p) => ({ id: p.id, text: p.text, priority: p.priority, branded: p.branded })),
      results: probeResults.map((r) => ({
        promptId: r.promptId,
        brandPresent: r.brandPresent,
        competitorsMentioned: r.competitorsMentioned,
        evidenceId: r.evidenceId,
        provider: r.provider,
        sentiment: r.sentiment,
        answerText: answerByEvidence.get(r.evidenceId),
        // D2/D3：已落库的确定性词表信号——供 branded 层三态判定（grounded/speculative/unknown/
        // unverified/undetermined）。webSearchEnabled 未落库到 ai_probe_results（只在
        // evidence_artifacts.request 里），不传即按聚合层的 provider 静态能力表兜底（D6）。
        citedUrls: r.citedUrls,
        hedged: r.hedged,
        unknownAdmission: r.unknownAdmission,
      })),
      brand: brandFromDomain(project.domain),
      competitors,
      // 遗留②修复（第二波任务）：此前未传 domain，ctx.probe.citedDomains 的 owned 判定在实时
      // 诊断阶段恒为 third_party（保守兜底，见 lib/probes/summary.ts ProbeSummaryInput.domain
      // 注释）。归一化复用 lib/probes/summary.ts 的 normalizeProjectDomain（第三波：与
      // reevaluate-competitors.ts 共享同一实现，不再各写一份）。
      domain: normalizeProjectDomain(project.domain),
    })

    const ctx = deps.buildRuleContext({
      project: {
        domain: project.domain,
        industry: project.industry,
        market: project.market,
        language: project.language,
        competitors: project.competitors ?? [],
      },
      evidence,
      probe,
      probeEvidenceId: probe?.sampleEvidenceId ?? null,
      robotsText: null,
      confirmedCompetitors: competitorInputs.confirmedCompetitors,
      keywordGaps: competitorInputs.ctxGaps,
    })

    let rules = await deps.allRules()
    try {
      const { orderRulesForRun } = await import('@/lib/knowledge/repository')
      rules = await orderRulesForRun(runId, rules)
    } catch {
      // 无知识脑会话的历史 run 沿用注册表顺序。
    }
    // 按本次数据源状态求值：缺数据源的规则不执行、记「未查」，不再沉默成「没问题」（spec 2026-10-09 §5.1-1）。
    const available = availableSources(sourceStatuses, { confirmedCompetitorCount: confirmed.length })
    const { hits, ledger } = deps.evaluateRulesWithLedger(ctx, rules, available)
    const fit = deps.buildIntentPageFitArtifactPayload(deps.buildIntentPageFitMap(ctx))
    return {
      hits,
      ledger,
      // 数组而非 Set：step 结果要能 JSON 回放。
      protocolBound: [...protocolBoundRuleIds(rules)],
      domain: project.domain,
      intentPageFit: fit.rowCount > 0 ? fit : null,
      gaps: competitorInputs.gaps,
      serpEvidenceId: competitorInputs.serpEvidenceId,
      market: project.market ?? '',
      language: project.language ?? '',
    } satisfies {
      hits: RuleHit[]
      ledger: LedgerRow[]
      protocolBound: string[]
      domain: string
      intentPageFit: IntentPageFitArtifactPayload | null
      gaps: KeywordGapResult[]
      serpEvidenceId: string | null
      market: string
      language: string
    }
  })

  // 关键词缺口落库单独一步：step 记忆化保证重试不重复写（spec §5.4-1）。
  await step.run('persist-keyword-gaps', () =>
    persistKeywordGaps(deps, { projectId, runId, market, language, gaps, serpEvidenceId }),
  )

  await emit({ type: 'phase', phase: 'diagnose', findings: hits.length })

  // —— findings 落库 ——：id 在 step 内生成（保证重试幂等），并原样回放供建议配对。
  const findingRows = await step.run('create-findings', async () => {
    const rows = buildFindingRows(runId, hits)
    await deps.createFindings(rows)
    return rows
  })

  // —— recommendations 落库 ——：按下标与 hits/findingRows 对齐（同源 map，顺序稳定），
  // findingId 取对应 finding 行的 id，保证 finding↔recommendation 配对正确。
  await step.run('create-recommendations', async () => {
    const rows = await buildRecommendationRows(runId, hits, findingRows, deps.generateRecommendation, domain)
    await deps.createRecommendations(rows)
    return rows.length
  })

  // —— 问题台账（spec 2026-10-09 §5.1）——：台账落库 → 对账 → 重算复查提醒，全部在标记完成之前。
  // 失败交给 Inngest 重试，耗尽后 onFailure 把体检标为失败，不会留下「诊断完成但问题表没更新」的状态。
  await step.run('write-check-ledger', () => deps.saveCheckLedger(runId, ledger))
  await step.run('reconcile-issues', async () => {
    // 已对账过（步骤提交后被重放）→ 跳过，避免把「新出现 / 复发」标记冲掉；reconcileIssues 对同一次体检本身也幂等，此为第二道防线。
    if (await deps.hasObservedEvents(runId)) return { skipped: true }
    const [run, projectIssues] = await Promise.all([deps.getRun(runId), deps.getProjectIssues(projectId)])
    const now = new Date().toISOString()
    const out = reconcileIssues({
      projectId,
      run: { id: runId, startedAt: run?.startedAt ?? run?.finishedAt ?? now, protocolHash: run?.protocolHash ?? null },
      issues: projectIssues,
      // findingRows 是 create-findings 步骤的记忆化结果：id 与已落库的发现一致（issues.latest_finding_id 外键指向 findings.id）。
      hits: findingRows.map(toObservedHit).filter((h): h is ObservedHit => h !== null),
      ledger,
      protocolBoundRuleIds: new Set(protocolBound),
      missingLedger: 'retire',
      newIssueId: () => `iss_${crypto.randomUUID()}`,
      now,
    })
    await deps.saveIssueChanges(out)
    return { issues: out.issues.length }
  })
  // 复查提醒重算单独成步、不受「已对账」守卫跳过：对账提交后若重算失败，重试时仍会重算，nextRetestDueAt 不会停在旧值。
  await step.run('recompute-retest-due', () => deps.recomputeRetestDue(projectId))

  await step.run('mark-reviewing', () =>
    deps.markRunStatus(runId, 'reviewing', { finishedAt: new Date().toISOString(), failureReason: null }),
  )
  await step.run('complete-workflow-runtime', async () => {
    try {
      const { completeWorkflowForRun, recordIntentPageFitArtifactForRun } = await import('@/lib/knowledge/repository')
      await completeWorkflowForRun(runId, hits)
      if (intentPageFit) await recordIntentPageFitArtifactForRun(runId, intentPageFit)
    } catch {
      // 工作流状态是增强追踪；失败不污染已完成的确定性诊断结果。
    }
  })

  await emit({ type: 'done' })

  return { status: 'reviewing', findings: hits.length }
}

export const generateFindings = inngest.createFunction(
  {
    id: 'generate-findings',
    retries: 3,
    onFailure: async (ctx) => {
      const original = (ctx.event.data as { event: { data: DiagnoseRequestedEventData } }).event
      const runId = original.data.runId
      const failure = ctx as { error?: Error; event: { data: { error?: { message?: string } } } }
      const reason = errorReason(failure.error ?? failure.event.data.error, 'diagnosis_failed')
      await markRunStatus(runId, 'failed', { failureReason: reason, finishedAt: new Date().toISOString() })
      try { await (await import('@/lib/knowledge/repository')).failWorkflowForRun(runId, reason) } catch { /* migration compatibility */ }
      // 重试耗尽后补发 failed，让 /runs/{id}/events 的诊断流收到终态并关闭。
      const publish = (ctx as { publish?: (m: unknown) => Promise<void> }).publish
      try {
        if (publish) await publish(await runProgressChannel(runId).progress({ type: 'failed', reason }))
      } catch {
        // publish 在失败上下文不可用时忽略——DB 状态已是 failed，SSE 路由终态短路兜底。
      }
    },
  },
  { event: DIAGNOSE_REQUESTED_EVENT },
  // 与 collect-evidence 同构：Inngest 运行时 ctx 比 handler 的 DiagnoseArgs 宽，
  // 在薄封装边界收窄成已单测的纯逻辑接缝期望的形状。
  (ctx) => generateFindingsHandler(ctx as unknown as Parameters<typeof generateFindingsHandler>[0]),
)
