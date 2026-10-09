import type { Rule } from './types'

// 规则依赖的数据源键（spec 2026-10-09 §5.1-1）。取值对齐 data_source_statuses.source_key（含 dataforseo:* 等子键），
// 另有两个伪数据源：entry（入口页抓取，没有状态行，失败会让整轮采集失败，故恒可用）、confirmed_competitors（已确认竞品）。
export type SourceKey =
  | 'entry'
  | 'crawl'
  | 'render'
  | 'psi'
  | 'gsc'
  | 'ai_probe'
  | 'ua_probe'
  | 'dataforseo:seed_serp'
  | 'dataforseo:labs'
  | 'dataforseo:backlinks'
  | 'dataforseo:bing_index'
  | 'dataforseo:brand_serp'
  | 'third_party:wikipedia'
  | 'third_party:reddit'
  | 'social_presence:youtube'
  | 'social_presence:g2'
  | 'social_presence:trustpilot'
  | 'social_presence:capterra'
  | 'confirmed_competitors'

// 数组 = 「其中任一可用即可」。
export type SourceRequirement = SourceKey | SourceKey[]

export interface SourceStatusLike {
  sourceKey: string
  status: string
  capturedEvidenceCount: number
}

// 可用 = collected，或 partial 且确实采到证据（render 自动降级时是 partial + 0 条，不能当可用）。
export function availableSources(rows: SourceStatusLike[], opts: { confirmedCompetitorCount: number }): Set<SourceKey> {
  const out = new Set<SourceKey>(['entry'])
  for (const r of rows) {
    if (r.status === 'collected' || (r.status === 'partial' && r.capturedEvidenceCount > 0)) out.add(r.sourceKey as SourceKey)
  }
  if (opts.confirmedCompetitorCount > 0) out.add('confirmed_competitors')
  return out
}

export function unmetRequirements(reqs: SourceRequirement[], available: Set<SourceKey>): SourceRequirement[] {
  return reqs.filter((r) => (Array.isArray(r) ? !r.some((k) => available.has(k)) : !available.has(r)))
}

// 协议相关数据源：结论随检测协议（AI 提问集、已确认竞品、种子词）变化，换协议后不能拿来判「已修复」（spec 4.4-6）。
export const PROTOCOL_SOURCES: ReadonlySet<SourceKey> = new Set<SourceKey>([
  'ai_probe',
  'confirmed_competitors',
  'dataforseo:seed_serp',
  'dataforseo:labs',
])

// 只看必需项（单键）；任一组不计——组内总有不受协议约束的替代来源。
export function isProtocolBound(reqs: SourceRequirement[]): boolean {
  return reqs.some((r) => !Array.isArray(r) && PROTOCOL_SOURCES.has(r))
}

export function protocolBoundRuleIds(rules: Rule[]): Set<string> {
  return new Set(rules.filter((r) => isProtocolBound(r.requiredSources)).map((r) => r.id))
}
