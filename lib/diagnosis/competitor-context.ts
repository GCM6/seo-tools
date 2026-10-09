import type { computeKeywordGaps, KeywordGapResult } from './keyword-gap'
import type { DiagnosisEvidenceRow, RuleContext } from './types'
import type { SeedSerpEntry, LabsKeywordDatum } from '@/lib/dataforseo/types'
import type { upsertKeyword, createKeywordGaps } from '@/lib/repositories'

// 已确认竞品相关的规则输入（spec 2026-10-09 §5.4-1）：主诊断与竞品确认后的再评估共用，口径一致。
export interface CompetitorInputs {
  confirmedCompetitors: { domain: string; name: string }[]
  gaps: KeywordGapResult[]
  ctxGaps: RuleContext['keywordGaps']
  serpEvidenceId: string | null
  // 探针 SoV 竞品集：项目手填竞品 ∪ 已确认竞品名（缺名回退域名）——名才能被答案原文匹配到（SP-A2 #6）。
  probeCompetitors: string[]
}

export function buildCompetitorInputs(args: {
  evidence: DiagnosisEvidenceRow[]
  confirmed: { domain: string; name: string | null }[]
  projectDomain: string
  projectCompetitors: string[]
  computeKeywordGaps: typeof computeKeywordGaps
}): CompetitorInputs {
  const confirmedCompetitors = args.confirmed.map((c) => ({ domain: c.domain, name: c.name ?? '' }))
  // seed_serp 原始结果 + evidenceId（gap 计算的基础与证据锚）。
  const serpRow = args.evidence.find((e) => e.type === 'dataforseo_serp' && (e.payload as { kind?: string } | null)?.kind === 'seed_serp')
  const serpResults = serpRow ? ((serpRow.payload as { results?: SeedSerpEntry[] }).results ?? []) : []
  const serpEvidenceId = serpRow?.id ?? null
  // Labs 关键词数据（搜索量/难度/意图）。
  const labsRow = args.evidence.find((e) => e.type === 'dataforseo_labs')
  const keywordData = labsRow ? ((labsRow.payload as { keywords?: LabsKeywordDatum[] }).keywords ?? []) : []

  // 缺口计算需种子 SERP + 已确认竞品；缺一则空（K03/K04 由台账记「没查」，见 rule-meta）。
  const gaps =
    serpResults.length && confirmedCompetitors.length && serpEvidenceId
      ? args.computeKeywordGaps({
          serp: serpResults,
          ownDomain: args.projectDomain,
          confirmedCompetitorDomains: confirmedCompetitors.map((c) => c.domain),
          keywordData,
        })
      : []
  const ctxGaps: RuleContext['keywordGaps'] = serpEvidenceId
    ? gaps.map((g) => ({
        keyword: g.keyword,
        gapType: g.gapType,
        ourPosition: g.ourPosition,
        opportunityScore: g.opportunityScore,
        searchVolume: g.searchVolume,
        evidenceId: serpEvidenceId,
      }))
    : []
  const tokens = confirmedCompetitors.map((c) => c.name || c.domain)
  return {
    confirmedCompetitors,
    gaps,
    ctxGaps,
    serpEvidenceId,
    probeCompetitors: [...new Set([...args.projectCompetitors, ...tokens])],
  }
}

// 落 keyword_gaps（upsert 关键词取 id）。返回写入行数。
export async function persistKeywordGaps(
  deps: { upsertKeyword: typeof upsertKeyword; createKeywordGaps: typeof createKeywordGaps },
  args: { projectId: string; runId: string; market: string; language: string; gaps: KeywordGapResult[]; serpEvidenceId: string | null },
): Promise<number> {
  if (!args.gaps.length || !args.serpEvidenceId) return 0
  const rows: Parameters<typeof createKeywordGaps>[0] = []
  for (const g of args.gaps) {
    const [kw] = await deps.upsertKeyword({
      id: `kw_${crypto.randomUUID()}`,
      projectId: args.projectId,
      text: g.keyword,
      market: args.market,
      language: args.language,
      source: 'dataforseo',
      intent: '',
    })
    rows.push({
      id: `gap_${crypto.randomUUID()}`,
      runId: args.runId,
      keywordId: kw.id,
      gapType: g.gapType,
      ourPosition: g.ourPosition === null ? null : String(g.ourPosition),
      competitorPositions: g.competitorPositions,
      opportunityScore: String(g.opportunityScore),
      evidenceId: args.serpEvidenceId,
    })
  }
  await deps.createKeywordGaps(rows)
  return rows.length
}
