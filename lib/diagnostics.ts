import type { EvidenceLevel } from './types'

// 屏2「现状」四个固定诊断维度。顺序即展示顺序。
export type StatCardKey = 'aiVisibility' | 'avgRank' | 'crawlableText' | 'schemaCoverage'

// pending 的原因用「数据源 / 状态」而非 sprint 号（sprint 是内部排期概念，不该进用户文案，
// 也不该把「已建成但本轮未采到」误标成「待接入」）：
//   ai_probe / gsc  —— 该数据源尚未接入（真实探针 / GSC OAuth 未实现）
//   uncollected     —— 数据源（页面抓取）已就绪，只是本轮尚未采集到该证据
export type PendingReason = 'ai_probe' | 'gsc' | 'uncollected'

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

// AI 可见度需要跨 20 条探针聚合，真实探针管道尚未接入；在此之前一律 pending，
// 不拿演示数字冒充实测。
function deriveAiVisibility(): StatCard {
  return { key: 'aiVisibility', state: 'pending', reason: 'ai_probe' }
}

// 平均自然排名来自 GSC。demo 有 gsc 种子证据可派生 avgPosition；缺则 GSC 数据源待接入。
function deriveAvgRank(evidence: EvidenceLike[]): StatCard {
  const gsc = pick(evidence, 'gsc')
  const avgPosition = num(gsc?.payload, 'avgPosition')
  if (gsc && avgPosition !== undefined)
    return { key: 'avgRank', state: 'measured', value: String(avgPosition), level: gsc.claimLevel as EvidenceLevel, evidenceId: gsc.id }
  return { key: 'avgRank', state: 'pending', reason: 'gsc' }
}

// 正文可抓取占比 = 初始 HTML 正文 / 渲染后正文（render_check 实测）。
// AI/搜索爬虫多不执行 JS，初始 HTML 里的正文才是可抓取的，占比越低越危险。
// 抓取数据源已就绪，缺证据只意味着本轮尚未采集（uncollected），而非功能未建。
function deriveCrawlableText(evidence: EvidenceLike[]): StatCard {
  const rc = pick(evidence, 'render_check')
  const initial = num(rc?.payload, 'initialHtmlMainTextChars')
  const rendered = num(rc?.payload, 'renderedMainTextChars')
  if (rc && initial !== undefined && rendered !== undefined) {
    const pct = rendered > 0 ? Math.min(100, Math.round((initial / rendered) * 100)) : initial > 0 ? 100 : 0
    return { key: 'crawlableText', state: 'measured', value: String(pct), level: rc.claimLevel as EvidenceLevel, evidenceId: rc.id }
  }
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

export function deriveStatCards(evidence: EvidenceLike[]): StatCard[] {
  return [deriveAiVisibility(), deriveAvgRank(evidence), deriveCrawlableText(evidence), deriveSchemaCoverage(evidence)]
}
