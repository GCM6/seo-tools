import type { EvidenceLevel } from './types'

// 屏2「现状」四个固定诊断维度。顺序即展示顺序。
export type StatCardKey = 'aiVisibility' | 'avgRank' | 'crawlableText' | 'schemaCoverage'

// 每张卡要么由当前 run 的证据严格派生（measured，带证据分级 + 可溯源的 evidenceId），
// 要么因缺少对应数据源而待接入（pending，标注依赖的后续 SP）。绝不显示无证据的数字。
export type StatCard =
  | { key: StatCardKey; state: 'measured'; value: string; level: EvidenceLevel; evidenceId: string }
  | { key: StatCardKey; state: 'pending'; dependsOn: string }

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

// AI 可见度需要跨 20 条探针聚合，真实探针管道是 SP4；在此之前一律待接入，
// 不拿演示数字冒充实测。
function deriveAiVisibility(): StatCard {
  return { key: 'aiVisibility', state: 'pending', dependsOn: 'SP4' }
}

// 平均自然排名来自 GSC（SP3）。demo 有 gsc 种子证据可派生 avgPosition。
function deriveAvgRank(evidence: EvidenceLike[]): StatCard {
  const gsc = pick(evidence, 'gsc')
  const avgPosition = num(gsc?.payload, 'avgPosition')
  if (gsc && avgPosition !== undefined)
    return { key: 'avgRank', state: 'measured', value: String(avgPosition), level: gsc.claimLevel as EvidenceLevel, evidenceId: gsc.id }
  return { key: 'avgRank', state: 'pending', dependsOn: 'SP3' }
}

// 正文可抓取占比 = 初始 HTML 正文 / 渲染后正文（本轮 SP2 render_check 实测）。
// AI/搜索爬虫多不执行 JS，初始 HTML 里的正文才是可抓取的，占比越低越危险。
function deriveCrawlableText(evidence: EvidenceLike[]): StatCard {
  const rc = pick(evidence, 'render_check')
  const initial = num(rc?.payload, 'initialHtmlMainTextChars')
  const rendered = num(rc?.payload, 'renderedMainTextChars')
  if (rc && initial !== undefined && rendered !== undefined) {
    const pct = rendered > 0 ? Math.min(100, Math.round((initial / rendered) * 100)) : initial > 0 ? 100 : 0
    return { key: 'crawlableText', state: 'measured', value: String(pct), level: rc.claimLevel as EvidenceLevel, evidenceId: rc.id }
  }
  return { key: 'crawlableText', state: 'pending', dependsOn: 'SP2' }
}

// 结构化数据覆盖 = JSON-LD/schema.org 类型数（本轮 SP2 schema 实测）。
function deriveSchemaCoverage(evidence: EvidenceLike[]): StatCard {
  const sc = pick(evidence, 'schema')
  const types = (sc?.payload as { types?: unknown } | null | undefined)?.types
  if (sc && Array.isArray(types))
    return { key: 'schemaCoverage', state: 'measured', value: String(types.length), level: sc.claimLevel as EvidenceLevel, evidenceId: sc.id }
  return { key: 'schemaCoverage', state: 'pending', dependsOn: 'SP2' }
}

export function deriveStatCards(evidence: EvidenceLike[]): StatCard[] {
  return [deriveAiVisibility(), deriveAvgRank(evidence), deriveCrawlableText(evidence), deriveSchemaCoverage(evidence)]
}
