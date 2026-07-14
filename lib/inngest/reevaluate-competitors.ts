import { NonRetriableError } from 'inngest'
import { inngest } from './client'
import { COMPETITORS_CONFIRMED_EVENT, type CompetitorsConfirmedEventData } from './events'
import { runProgressChannel, type RunProgressMessage } from './channels'
import { buildRuleContext } from '@/lib/diagnosis/context'
import { evaluateRules } from '@/lib/diagnosis/engine'
import type { DiagnosisEvidenceRow, Rule, RuleContext, RuleHit } from '@/lib/diagnosis/types'
import { buildFindingRows, buildRecommendationRows, type RecommendationDraft } from '@/lib/diagnosis/finding-rows'
import { computeKeywordGaps } from '@/lib/diagnosis/keyword-gap'
import { aggregateProbeSummary } from '@/lib/probes/summary'
import { brandFromDomain } from '@/lib/probes/prompt-set'
import type { SeedSerpEntry, LabsKeywordDatum } from '@/lib/dataforseo/types'
import type { EvidenceLevel, EvidenceType } from '@/lib/types'
import {
  getProject,
  getConfirmedCompetitors,
  getRunEvidence,
  getRunPrompts,
  getRunProbeResults,
  getFindings,
  upsertKeyword,
  createKeywordGaps,
  createFindings,
  createRecommendations,
  createEvidenceArtifact,
} from '@/lib/repositories'
import { fetchLightCheck } from '@/lib/crawl/light-check'
import { sha256Hex } from '@/lib/collection/hash'
import { selectCompetitorFormTargets, collectCompetitorForm } from '@/lib/collection/competitor-form'

// —— 竞品确认后增量再评估（Phase C 两段式诊断第二段，spec §5.1-4）——
// 触发：用户在 competitors 页确认/驳回竞品后（COMPETITORS_CONFIRMED_EVENT）。
// 只重算竞品依赖规则（K03-05/Q01-03/A01 对比/E03 等），按 fingerprint 只落**新增** finding，
// 不重跑采集、不改 run 状态（保持 reviewing）。确认动作幂等——同 fingerprint 不重复落库。

interface ReevalStep {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

interface ReevalArgs {
  event: { data: CompetitorsConfirmedEventData }
  step: ReevalStep
  publish: (msg: unknown) => Promise<void>
}

interface ReevaluateDeps {
  getProject: typeof getProject
  getConfirmedCompetitors: typeof getConfirmedCompetitors
  getRunEvidence: typeof getRunEvidence
  getRunPrompts: typeof getRunPrompts
  getRunProbeResults: typeof getRunProbeResults
  getFindings: typeof getFindings
  upsertKeyword: typeof upsertKeyword
  createKeywordGaps: typeof createKeywordGaps
  createFindings: typeof createFindings
  createRecommendations: typeof createRecommendations
  computeKeywordGaps: typeof computeKeywordGaps
  evaluateRules: typeof evaluateRules
  buildRuleContext: typeof buildRuleContext
  aggregateProbeSummary: typeof aggregateProbeSummary
  createEvidenceArtifact: typeof createEvidenceArtifact
  fetchLightCheck: typeof fetchLightCheck
  allRules: () => Promise<Rule[]> | Rule[]
  generateRecommendation: (hit: RuleHit, opts: { domain: string }) => Promise<RecommendationDraft> | RecommendationDraft
}

function errorReason(err: unknown, fallback = 'reevaluate_failed'): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'object' && err && 'message' in err && typeof err.message === 'string' && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return fallback
}

function defaultDeps(): ReevaluateDeps {
  return {
    getProject,
    getConfirmedCompetitors,
    getRunEvidence,
    getRunPrompts,
    getRunProbeResults,
    getFindings,
    upsertKeyword,
    createKeywordGaps,
    createFindings,
    createRecommendations,
    computeKeywordGaps,
    evaluateRules,
    buildRuleContext,
    aggregateProbeSummary,
    createEvidenceArtifact,
    fetchLightCheck,
    allRules: async () => (await import('@/lib/diagnosis/rules')).allRules,
    generateRecommendation: async (hit, opts) => (await import('@/lib/diagnosis/recommend')).generateRecommendation(hit, opts),
  }
}

export async function reevaluateCompetitorsHandler(
  { event, step, publish }: ReevalArgs,
  deps: ReevaluateDeps = defaultDeps(),
): Promise<{ status: 'reviewing'; newFindings: number }> {
  const { runId, projectId } = event.data
  const channel = runProgressChannel(runId)
  const emit = async (msg: RunProgressMessage) => publish(await channel.progress(msg))

  await emit({ type: 'phase', phase: 'diagnose' })

  // 证据 rawText 可能很大：整个加载+算 gap+求值裹进一个 step，只回放精简 newHits/domain。
  const { newHits, domain } = await step.run('reeval-rules', async () => {
    const project = await deps.getProject(projectId)
    if (!project) throw new NonRetriableError(`project_not_found:${projectId}`)

    const [confirmed, evidenceRaw, prompts, probeResults, existing] = await Promise.all([
      deps.getConfirmedCompetitors(projectId),
      deps.getRunEvidence(runId),
      deps.getRunPrompts(runId),
      deps.getRunProbeResults(runId),
      deps.getFindings(runId),
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

    const confirmedDomains = confirmed.map((c) => c.domain)
    const confirmedCompetitors = confirmed.map((c) => ({ domain: c.domain, name: c.name ?? '' }))

    // seed_serp 原始结果 + evidenceId（gap 计算的基础与证据锚）。
    const serpRow = evidence.find((e) => e.type === 'dataforseo_serp' && (e.payload as { kind?: string } | null)?.kind === 'seed_serp')
    const serpResults = serpRow ? ((serpRow.payload as { results?: SeedSerpEntry[] }).results ?? []) : []
    const serpEvidenceId = serpRow?.id ?? null

    // Labs 关键词数据（搜索量/难度/意图）。
    const labsRow = evidence.find((e) => e.type === 'dataforseo_labs')
    const keywordData = labsRow ? ((labsRow.payload as { keywords?: LabsKeywordDatum[] }).keywords ?? []) : []

    // gap 计算需 seed_serp + 确认竞品；缺一则空（K03/K04 no-op）。
    const gaps =
      serpResults.length && confirmedDomains.length && serpEvidenceId
        ? deps.computeKeywordGaps({
            serp: serpResults,
            ownDomain: project.domain,
            confirmedCompetitorDomains: confirmedDomains,
            keywordData,
          })
        : []

    // 落 keyword_gaps（upsert keyword 取 id）+ 组 RuleContext.keywordGaps（含 evidenceId 供规则引用）。
    const ctxGaps: RuleContext['keywordGaps'] = []
    if (gaps.length && serpEvidenceId) {
      const gapRows: Parameters<typeof deps.createKeywordGaps>[0] = []
      for (const g of gaps) {
        const [kw] = await deps.upsertKeyword({
          id: `kw_${crypto.randomUUID()}`,
          projectId,
          text: g.keyword,
          market: project.market ?? '',
          language: project.language ?? '',
          source: 'dataforseo',
          intent: '',
        })
        gapRows.push({
          id: `gap_${crypto.randomUUID()}`,
          runId,
          keywordId: kw.id,
          gapType: g.gapType,
          ourPosition: g.ourPosition === null ? null : String(g.ourPosition),
          competitorPositions: g.competitorPositions,
          opportunityScore: String(g.opportunityScore),
          evidenceId: serpEvidenceId,
        })
        ctxGaps.push({
          keyword: g.keyword,
          gapType: g.gapType,
          ourPosition: g.ourPosition,
          opportunityScore: g.opportunityScore,
          searchVolume: g.searchVolume,
          evidenceId: serpEvidenceId,
        })
      }
      await deps.createKeywordGaps(gapRows)
    }

    // 探针 SoV 竞品集并入确认竞品「名」（优先品牌名、缺名回退域）——名才能被答案原文匹配到，
    // 配合下方重解析解掉探针期冻结（SP-A2 #6）。Q02 按 s.name===c.name 匹配到位。
    const confirmedTokens = confirmedCompetitors.map((c) => c.name || c.domain)
    const competitors = [...new Set([...(project.competitors ?? []), ...confirmedTokens])]
    // 原始回答文本按 evidenceId 归档：聚合期对当前竞品集重解析（解冻），无原文者回退冻结值。
    const answerByEvidence = new Map(
      evidence.map((e) => [e.id, (e.payload as { answerText?: string } | null)?.answerText]),
    )
    const probe = deps.aggregateProbeSummary({
      // D1/D2/D3（GEO branded/unbranded 重设计）：与 generate-findings.ts 同款接线——透传
      // prompts.branded + 已落库的 citedUrls/hedged/unknownAdmission，供 G05/G06/G10 用 unbranded/
      // branded 三态口径。webSearchEnabled 未落库，按聚合层 provider 静态能力表兜底（D6）。
      prompts: prompts.map((p) => ({ id: p.id, text: p.text, priority: p.priority, branded: p.branded })),
      results: probeResults.map((r) => ({
        promptId: r.promptId,
        brandPresent: r.brandPresent,
        competitorsMentioned: r.competitorsMentioned,
        evidenceId: r.evidenceId,
        provider: r.provider,
        sentiment: r.sentiment,
        answerText: answerByEvidence.get(r.evidenceId),
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
        competitors: project.competitors ?? [],
      },
      evidence,
      probe,
      probeEvidenceId: probe?.sampleEvidenceId ?? null,
      robotsText: null,
      confirmedCompetitors,
      keywordGaps: ctxGaps,
    })

    const rules = await deps.allRules()
    const hits = deps.evaluateRules(ctx, rules)
    // 按 fingerprint 只保留当前 run 尚不存在的命中（增量并入；确认幂等）。
    const existingFps = new Set(existing.map((f) => f.fingerprint).filter(Boolean))
    const newHits = hits.filter((h) => !existingFps.has(h.fingerprint))
    return { newHits, domain: project.domain }
  })

  await emit({ type: 'phase', phase: 'diagnose', findings: newHits.length })

  const findingRows = await step.run('reeval-create-findings', async () => {
    const rows = buildFindingRows(runId, newHits)
    await deps.createFindings(rows)
    return rows
  })

  await step.run('reeval-create-recommendations', async () => {
    const rows = await buildRecommendationRows(runId, newHits, findingRows, deps.generateRecommendation, domain)
    await deps.createRecommendations(rows)
    return rows.length
  })

  // —— Q03 竞品内容形态轻检（SP-A2）：确认竞品在种子词的排名页轻检，落 competitor_content_form
  // 证据（复用 dataforseo_serp + payload.kind，免 migration），供 content_brief 第 2 段消费。
  // 整步 try/catch 吞掉——采集失败不污染 reeval 主流程，brief 回落「待补」。
  await step.run('collect-competitor-form', async () => {
    try {
      const [confirmed, evidenceRaw] = await Promise.all([
        deps.getConfirmedCompetitors(projectId),
        deps.getRunEvidence(runId),
      ])
      const confirmedDomains = confirmed.map((c) => c.domain)
      const serpRow = evidenceRaw.find(
        (e) => e.type === 'dataforseo_serp' && (e.payload as { kind?: string } | null)?.kind === 'seed_serp',
      )
      const serpResults = serpRow ? ((serpRow.payload as { results?: SeedSerpEntry[] }).results ?? []) : []
      const targets = selectCompetitorFormTargets(serpResults, confirmedDomains)
      if (!targets.length) return { collected: 0 }
      const signals = await collectCompetitorForm(targets, { fetchLightCheck: deps.fetchLightCheck })
      if (!signals.length) return { collected: 0 }
      const payload = { kind: 'competitor_content_form', signals }
      const rawText = JSON.stringify(payload)
      await deps.createEvidenceArtifact({
        id: `ev_${crypto.randomUUID()}`,
        projectId,
        runId,
        type: 'dataforseo_serp',
        claimLevel: 'L3',
        source: 'competitor_light_check',
        payload,
        rawText,
        rawHash: sha256Hex(rawText),
      })
      await emit({ type: 'evidence_created', evidenceType: 'dataforseo_serp' })
      return { collected: signals.length }
    } catch {
      return { collected: 0 }
    }
  })

  await emit({ type: 'done' })
  return { status: 'reviewing', newFindings: newHits.length }
}

export const reevaluateCompetitors = inngest.createFunction(
  {
    id: 'reevaluate-competitors',
    retries: 3,
    onFailure: async (ctx) => {
      // 再评估失败不改 run 状态（run 仍是 reviewing，首轮 findings 已在）；仅广播失败帧关闭 SSE。
      const original = (ctx.event.data as { event: { data: CompetitorsConfirmedEventData } }).event
      const runId = original.data.runId
      const failure = ctx as { error?: Error; event: { data: { error?: { message?: string } } } }
      const reason = errorReason(failure.error ?? failure.event.data.error)
      const publish = (ctx as { publish?: (m: unknown) => Promise<void> }).publish
      try {
        if (publish) await publish(await runProgressChannel(runId).progress({ type: 'failed', reason }))
      } catch {
        // publish 不可用时忽略。
      }
    },
  },
  { event: COMPETITORS_CONFIRMED_EVENT },
  (ctx) => reevaluateCompetitorsHandler(ctx as unknown as Parameters<typeof reevaluateCompetitorsHandler>[0]),
)
