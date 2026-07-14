import { NonRetriableError } from 'inngest'
import { inngest } from './client'
import { DIAGNOSE_REQUESTED_EVENT, type DiagnoseRequestedEventData } from './events'
import { runProgressChannel, type RunProgressMessage } from './channels'
import { buildRuleContext, parseGscKeywordMetrics } from '@/lib/diagnosis/context'
import { buildMetricPair, buildProbeMetricRows, checkUnbrandedComparability, type RunMetrics, type MetricTarget } from '@/lib/diagnosis/retest-metrics'
import { evaluateRules } from '@/lib/diagnosis/engine'
import type { DiagnosisEvidenceRow, Rule, RuleHit } from '@/lib/diagnosis/types'
import { buildFindingRows, buildRecommendationRows, type RecommendationDraft } from '@/lib/diagnosis/finding-rows'
import { aggregateProbeSummary } from '@/lib/probes/summary'
import { brandFromDomain } from '@/lib/probes/prompt-set'
import type { EvidenceLevel, EvidenceType } from '@/lib/types'
import type { FindingSeverity, Pillar } from '@/lib/diagnosis/types'
import type { ValidationSpec } from '@/lib/diagnosis/validation-spec'
import {
  computeFindingDelta,
  summarizeFindingDelta,
  computeOutcome,
  buildRetestSnapshotRows,
  type FindingRef,
} from '@/lib/diagnosis/retest-delta'
import { computeHealthScore } from '@/lib/diagnosis/health-score'
import {
  getRunEvidence,
  getProject,
  getRunPrompts,
  getRunProbeResults,
  createFindings,
  createRecommendations,
  markRunStatus,
  getFindings,
  getRecommendations,
  createRetestSnapshots,
  setRecommendationOutcome,
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
  // 回测收尾（spec §5.1-3）：读两轮 findings/建议、写 delta 快照与建议 outcome。
  getFindings: typeof getFindings
  getRecommendations: typeof getRecommendations
  createRetestSnapshots: typeof createRetestSnapshots
  setRecommendationOutcome: typeof setRecommendationOutcome
  evaluateRules: typeof evaluateRules
  buildRuleContext: typeof buildRuleContext
  aggregateProbeSummary: typeof aggregateProbeSummary
  // 规则注册表与建议生成器由诊断模块（并行开发）提供。用 loader/wrapper 形态注入，
  // 使本文件在这两个模块尚未落地时也能被单测加载（fake 注入，永不走真实 import 路径）。
  allRules: () => Promise<Rule[]> | Rule[]
  generateRecommendation: (
    hit: RuleHit,
    opts: { domain: string },
  ) => Promise<RecommendationDraft> | RecommendationDraft
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
    getFindings,
    getRecommendations,
    createRetestSnapshots,
    setRecommendationOutcome,
    evaluateRules,
    buildRuleContext,
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
  const { runId, projectId, baselineRunId } = event.data
  const channel = runProgressChannel(runId)
  const emit = async (msg: RunProgressMessage) => publish(await channel.progress(msg))

  await step.run('mark-diagnosing', () => deps.markRunStatus(runId, 'diagnosing', { failureReason: null }))
  await emit({ type: 'phase', phase: 'diagnose' })

  // —— 规则求值 ——（读证据 + 项目 + 探针聚合 → RuleContext → RuleHit[]）。
  // 证据 rawText 可能很大：整个加载+求值裹进一个 step，只把精简的 hits/domain 出参回放，
  // 避免把全站 HTML 塞进 Inngest step 状态往返序列化。
  const { hits, domain } = await step.run('run-rules', async () => {
    const project = await deps.getProject(projectId)
    if (!project) throw new NonRetriableError(`project_not_found:${projectId}`)

    const [evidenceRaw, prompts, probeResults] = await Promise.all([
      deps.getRunEvidence(runId),
      deps.getRunPrompts(runId),
      deps.getRunProbeResults(runId),
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

    const competitors = project.competitors ?? []
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
    })

    const ctx = deps.buildRuleContext({
      project: {
        domain: project.domain,
        industry: project.industry,
        market: project.market,
        language: project.language,
        competitors,
      },
      evidence,
      probe,
      probeEvidenceId: probe?.sampleEvidenceId ?? null,
      robotsText: null,
    })

    const rules = await deps.allRules()
    return { hits: deps.evaluateRules(ctx, rules), domain: project.domain }
  })

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

  await step.run('mark-reviewing', () =>
    deps.markRunStatus(runId, 'reviewing', { finishedAt: new Date().toISOString(), failureReason: null }),
  )

  // —— 回测收尾（spec §5.1-3）——：仅当本 run 是对 baselineRunId 的同协议重跑时，
  // 按 fingerprint 对齐两轮 findings 算四态 delta，据此写 baseline 建议 outcome（恒 inferred，
  // 只由 delta 计算写入）+ 落 retest_snapshots。delta 失败不污染主诊断（reviewing 已落库）。
  if (baselineRunId) {
    try {
      await step.run('compute-retest-delta', () => computeRetestDelta(deps, projectId, baselineRunId, runId))
    } catch {
      // 回测 delta 属增值输出；失败仅丢失快照/outcome，不回滚已完成的 reviewing 诊断。
    }
  }

  await emit({ type: 'done' })

  return { status: 'reviewing', findings: hits.length }
}

// getFindings 行 → FindingRef（回测按 fingerprint 对齐；空 fingerprint 无跨 run 身份，剔除）。
type FindingRow = Awaited<ReturnType<typeof getFindings>>[number]
function toFindingRefs(rows: FindingRow[]): FindingRef[] {
  return rows
    .filter((r): r is FindingRow & { fingerprint: string } => Boolean(r.fingerprint))
    .map((r) => ({ fingerprint: r.fingerprint, severity: r.severity as FindingSeverity, title: r.title }))
}

// pillar 非空的 finding 行 → 健康分入参（affectedRatio 缺省，站级按 1 计）。
function toHealthFindings(rows: FindingRow[]): { pillar: Pillar; severity: FindingSeverity }[] {
  return rows
    .filter((r): r is FindingRow & { pillar: Pillar } => r.pillar !== null)
    .map((r) => ({ pillar: r.pillar, severity: r.severity as FindingSeverity }))
}

// 回测 delta 收尾（纯 I/O 编排，纯逻辑委托 retest-delta / health-score 模块）。
async function computeRetestDelta(
  deps: GenerateFindingsDeps,
  projectId: string,
  baselineRunId: string,
  retestRunId: string,
): Promise<{ snapshots: number }> {
  const [baselineRows, retestRows, baseRecs] = await Promise.all([
    deps.getFindings(baselineRunId),
    deps.getFindings(retestRunId),
    deps.getRecommendations(baselineRunId),
  ])

  // 为一轮 run 构建可比标量来源（probe 品牌级 + GSC query 维关键词）。
  const buildRunMetrics = async (rid: string): Promise<RunMetrics> => {
    const [evidence, prompts, probeResults] = await Promise.all([
      deps.getRunEvidence(rid),
      deps.getRunPrompts(rid),
      deps.getRunProbeResults(rid),
    ])
    const probe = deps.aggregateProbeSummary({
      // D5：回测标量（retest-metrics.ts 的 brand_presence）已切到 probe.unbranded.present/total，
      // 该字段依赖 prompts.branded 正确透传，否则会把所有 prompt 当 unbranded 处理，回测口径失真。
      prompts: prompts.map((p) => ({ id: p.id, text: p.text, priority: p.priority, branded: p.branded })),
      results: probeResults.map((r) => ({
        promptId: r.promptId, brandPresent: r.brandPresent, competitorsMentioned: r.competitorsMentioned,
        evidenceId: r.evidenceId, provider: r.provider, sentiment: r.sentiment,
        citedUrls: r.citedUrls, hedged: r.hedged, unknownAdmission: r.unknownAdmission,
      })),
      brand: brandFromDomain((await deps.getProject(projectId))?.domain ?? ''),
      competitors: [],
    })
    const gscKeywords = parseGscKeywordMetrics(
      evidence.map((e) => ({ id: e.id, type: e.type as EvidenceType, claimLevel: e.claimLevel as EvidenceLevel, source: e.source, payload: e.payload, rawText: e.rawText, sitePageId: e.sitePageId })),
    ).map((k) => ({ keyText: k.keyText, impressions: k.impressions, position: k.position }))
    // 缺陷1 守卫所需信号（retest-metrics.ts checkUnbrandedComparability）：该轮 branded 题数 +
    // 探针解析器版本集合，供判定两轮 unbranded 口径是否可比（migration 0008 背景见 RunMetrics 注释）。
    const brandedPromptCount = prompts.filter((p) => p.branded).length
    const parserVersions = [...new Set(probeResults.map((r) => r.parserVersion))]
    return { probe, gscKeywords, brandedPromptCount, parserVersions }
  }

  const [baselineMetrics, retestMetrics] = await Promise.all([buildRunMetrics(baselineRunId), buildRunMetrics(retestRunId)])

  // ① finding 四态 delta（按 fingerprint 对齐）。
  const deltas = computeFindingDelta(toFindingRefs(baselineRows), toFindingRefs(retestRows))
  const summary = summarizeFindingDelta(deltas)
  const fpToState = new Map(deltas.map((d) => [d.fingerprint, d.state]))

  // ② baseline 建议 outcome：per-rec 取 finding.metricTarget → buildMetricPair；
  //    有真标量则压过四态，无则回退按 fingerprint→四态兜底（恒 inferred）。
  // 缺陷1 守卫延伸：probe 口径（brand_presence/brand_sov）指标若两轮 unbranded 口径不可比，
  // computeOutcome 会短路为 'unknown'，不产出会误导用户、污染 F3 rule-stats 的 effective/
  // ineffective/regressed（判定复用 retest-metrics.ts 的 checkUnbrandedComparability，两轮
  // 只需算一次，不逐条重复）。
  const unbrandedComparable = checkUnbrandedComparability(baselineMetrics, retestMetrics).comparable
  const idToFinding = new Map(baselineRows.map((r) => [r.id, r]))
  await Promise.all(
    baseRecs.map((rec) => {
      const f = idToFinding.get(rec.findingId)
      const fp = f?.fingerprint ?? null
      const state = (fp ? fpToState.get(fp) : undefined) ?? null
      const spec = (rec.validationSpec as ValidationSpec | null) ?? null
      const target = (f?.metricTarget as MetricTarget | null) ?? null
      const pair = spec ? buildMetricPair(spec, target, baselineMetrics, retestMetrics) : null
      const outcome = computeOutcome(spec, pair, state, unbrandedComparable)
      return deps.setRecommendationOutcome(rec.id, outcome)
    }),
  )

  // ③ 健康分 delta：两轮各自算 overall，pillarsWithData 取两轮出现过的支柱并集（保持可比）。
  const pillarsWithData = [
    ...new Set([...toHealthFindings(baselineRows), ...toHealthFindings(retestRows)].map((f) => f.pillar)),
  ]
  const baseOverall = computeHealthScore({ findings: toHealthFindings(baselineRows), pillarsWithData }).overall
  const retestOverall = computeHealthScore({ findings: toHealthFindings(retestRows), pillarsWithData }).overall

  // ④ 落 retest_snapshots：四态/健康分行 + probe 品牌指标行。
  const snapshotRows = [
    ...buildRetestSnapshotRows(summary, { baseline: baseOverall, retest: retestOverall }),
    ...buildProbeMetricRows(baselineMetrics, retestMetrics),
  ]
  const rows = snapshotRows.map((row) => ({
    id: `rts_${crypto.randomUUID()}`,
    projectId,
    baselineRunId,
    retestRunId,
    metricName: row.metricName,
    baselineValue: row.baselineValue,
    retestValue: row.retestValue,
    delta: row.delta,
    interpretation: row.interpretation,
  }))
  await deps.createRetestSnapshots(rows)
  return { snapshots: rows.length }
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
