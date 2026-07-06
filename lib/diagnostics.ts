import type { EvidenceLevel } from './types'
import type { ProbeSummary } from './probes/summary'

// 屏2「现状」固定诊断维度。顺序即展示顺序。
export type StatCardKey = 'indexVisibility' | 'aiVisibility' | 'avgRank' | 'crawlableText' | 'schemaCoverage'

// pending 的原因用「数据源 / 状态」而非 sprint 号（sprint 是内部排期概念，不该进用户文案，
// 也不该把「已建成但本轮未采到」误标成「待接入」）：
//   search_provider / ai_probe / gsc  —— 该数据源尚未接入（搜索可见性 / 真实探针 / GSC OAuth 未实现）
//   render_provider —— 渲染对比依赖托管浏览器 API（Cloudflare），key 未配置
//   uncollected     —— 数据源已就绪，只是本轮尚未采集到该证据
export type PendingReason = 'search_provider' | 'ai_probe' | 'gsc' | 'render_provider' | 'uncollected'

// 每张卡要么由当前 run 的证据严格派生（measured，带证据分级 + 可溯源的 evidenceId），
// 要么 pending（标注原因）。绝不显示无证据的数字。
export type StatCard =
  | { key: StatCardKey; state: 'measured'; value: string; level: EvidenceLevel; evidenceId: string }
  | { key: StatCardKey; state: 'pending'; reason: PendingReason }

// 派生只依赖证据的这几个字段，不耦合完整 Drizzle 行。
export interface EvidenceLike {
  id: string
  type: string
  claimLevel: string
  payload: unknown
}

function pick(evidence: EvidenceLike[], type: string): EvidenceLike | undefined {
  return evidence.find((e) => e.type === type)
}

function num(payload: unknown, key: string): number | undefined {
  const v = (payload as Record<string, unknown> | null | undefined)?.[key]
  return typeof v === 'number' ? v : undefined
}

// Google 前台 `site:domain` 可见性来自真实搜索 provider（如 Google Custom Search）。
// 它是外部可见性信号，不等同于 GSC 官方索引真相，因此证据等级保持 L2。
function deriveIndexVisibility(evidence: EvidenceLike[]): StatCard {
  const serp = pick(evidence, 'serp_snapshot')
  const totalResults = num(serp?.payload, 'totalResults')
  const resultCount = num(serp?.payload, 'resultCount')
  if (serp && totalResults !== undefined)
    return { key: 'indexVisibility', state: 'measured', value: String(totalResults), level: serp.claimLevel as EvidenceLevel, evidenceId: serp.id }
  if (serp && resultCount !== undefined)
    return { key: 'indexVisibility', state: 'measured', value: String(resultCount), level: serp.claimLevel as EvidenceLevel, evidenceId: serp.id }
  return { key: 'indexVisibility', state: 'pending', reason: 'search_provider' }
}

// AI 可见度 = 品牌在 20 条探针 prompt 中出现的条数，由 ai_probe_results 聚合
// （lib/probes/summary）派生，L3 采样实测；无聚合数据时保持 pending，
// 不拿合成数字冒充实测。卡片可点开一条代表性回答原文复核。
function deriveAiVisibility(probe: ProbeSummary | null | undefined): StatCard {
  if (probe && probe.sampleEvidenceId)
    return {
      key: 'aiVisibility',
      state: 'measured',
      value: String(probe.promptsPresent),
      level: 'L3',
      evidenceId: probe.sampleEvidenceId,
    }
  return { key: 'aiVisibility', state: 'pending', reason: 'ai_probe' }
}

// 平均自然排名来自 GSC。择带 avgPosition 的 gsc 证据（一次采集写 query + queryPage 两条 gsc，仅 query 维带 avgPosition）。
function deriveAvgRank(evidence: EvidenceLike[]): StatCard {
  const gsc = evidence.find((e) => e.type === 'gsc' && num(e.payload, 'avgPosition') !== undefined)
  if (gsc) {
    const avgPosition = num(gsc.payload, 'avgPosition')!
    return { key: 'avgRank', state: 'measured', value: String(avgPosition), level: gsc.claimLevel as EvidenceLevel, evidenceId: gsc.id }
  }
  return { key: 'avgRank', state: 'pending', reason: 'gsc' }
}

// 正文可抓取占比 = 初始 HTML 正文 / 渲染后正文（render_check 实测）。
// AI/搜索爬虫多不执行 JS，初始 HTML 里的正文才是可抓取的，占比越低越危险。
// 缺证据时要区分：Cloudflare 未配置 → render_provider（配 key 才有数）；
// 已配置 → uncollected（重新诊断即可采到）。
function deriveCrawlableText(evidence: EvidenceLike[], sources?: DataSourceFlags): StatCard {
  const rc = pick(evidence, 'render_check')
  const initial = num(rc?.payload, 'initialHtmlMainTextChars')
  const rendered = num(rc?.payload, 'renderedMainTextChars')
  if (rc && initial !== undefined && rendered !== undefined) {
    const pct = rendered > 0 ? Math.min(100, Math.round((initial / rendered) * 100)) : initial > 0 ? 100 : 0
    return { key: 'crawlableText', state: 'measured', value: String(pct), level: rc.claimLevel as EvidenceLevel, evidenceId: rc.id }
  }
  if (sources && sources.renderProvider === false)
    return { key: 'crawlableText', state: 'pending', reason: 'render_provider' }
  return { key: 'crawlableText', state: 'pending', reason: 'uncollected' }
}

// 结构化数据覆盖 = JSON-LD/schema.org 类型数（schema 实测）。同样：缺证据 = 本轮未采集。
function deriveSchemaCoverage(evidence: EvidenceLike[]): StatCard {
  const sc = pick(evidence, 'schema')
  const types = (sc?.payload as { types?: unknown } | null | undefined)?.types
  if (sc && Array.isArray(types))
    return { key: 'schemaCoverage', state: 'measured', value: String(types.length), level: sc.claimLevel as EvidenceLevel, evidenceId: sc.id }
  return { key: 'schemaCoverage', state: 'pending', reason: 'uncollected' }
}

export interface DataSourceFlags {
  renderProvider?: boolean
}

export interface DeriveOptions {
  probe?: ProbeSummary | null
  sources?: DataSourceFlags
}

export function deriveStatCards(evidence: EvidenceLike[], opts?: DeriveOptions): StatCard[] {
  return [
    deriveIndexVisibility(evidence),
    deriveAiVisibility(opts?.probe),
    deriveAvgRank(evidence),
    deriveCrawlableText(evidence, opts?.sources),
    deriveSchemaCoverage(evidence),
  ]
}
