import { readLinkGraph, type LinkGraphPayload, type LinkGraphView } from './link-graph'
import { canonicalElsewhere, isNoindex, isUtilityPage } from './link-integrity'
import type { SiteAuditPage } from './site-audit'
import { normalizeUrl } from './url'

// 内链权重（spec 2026-09-29-s3-internal-link-equity §3）：在 S1 链接图的可跟随边上算经典 PageRank。
// PageRank 是模型，不是搜索引擎的真实权重；W01/W02/W04 一律 inferred，描述须写「在本次抓取的链接图内」。

export const PAGERANK_DAMPING = 0.85
const MAX_ITERATIONS = 100
const CONVERGENCE = 1e-6
export const MIN_HTML_PAGES = 10 // 已抓 HTML 页少于此数，百分位无意义，整组不判定
export const VALUE_TOP_SHARE = 0.2 // GSC 有效页中取前 20% 为高价值页
const GSC_MIN_IMPRESSIONS = 50

// 第三轮独立审查 P1-8 后：不再用「零展现」（GSC 只取前 1000 行 page×query，缺席 ≠ 零展现，无法验证）；
// 功能页（隐私/条款/登录…）全站链接是正常做法，不算低价值（与 S2 L03 / S4 TR06 立场一致）。
export type LowValueReason = 'noindex' | 'canonical' | 'pagination'

export interface ValuePage {
  url: string
  source: 'key' | 'gsc' | 'both'
  clicks: number
  impressions: number
  evidenceIds: string[] // 支撑「高价值」判定的 GSC 证据（W01 证据引用用）
}

export interface LinkEquity {
  graph: LinkGraphView
  rank: Map<string, number>
  // 相对权重 = PageRank / 已抓 HTML 页的中位数（1.0 = 居中）。不用百分位：扁平站点（每页互链）PageRank 几乎均匀，
  // 百分位会把 4% 的差异放大成「垫底/靠前」（2026-10-03 真实站点 metadocu.com 冒烟发现）。只含已抓 HTML 页。
  relative: Map<string, number>
  htmlCount: number
  coverage: number // 已抓 HTML 页 / 图谱节点
  valuePages: ValuePage[]
  lowValue: Map<string, LowValueReason[]>
  hasGsc: boolean
}

// 经典 PageRank：阻尼 0.85、均匀跳转；悬挂节点（未抓、禁抓、无可跟随出链）的质量均匀重分配，总和恒为 1。
export function internalPageRank(view: LinkGraphView): Map<string, number> {
  const urls = view.nodes.map((n) => n.url)
  const n = urls.length
  if (n === 0) return new Map()
  const index = new Map(urls.map((u, i) => [u, i]))
  const out: number[][] = urls.map(() => [])
  for (const e of view.edges) {
    if (!e.followable) continue
    const from = index.get(e.from)
    const to = index.get(e.to)
    if (from !== undefined && to !== undefined) out[from].push(to)
  }
  let rank = new Array<number>(n).fill(1 / n)
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const next = new Array<number>(n).fill((1 - PAGERANK_DAMPING) / n)
    let dangling = 0
    for (let i = 0; i < n; i++) {
      if (out[i].length === 0) {
        dangling += rank[i]
        continue
      }
      const share = (PAGERANK_DAMPING * rank[i]) / out[i].length
      for (const j of out[i]) next[j] += share
    }
    const spread = (PAGERANK_DAMPING * dangling) / n
    let delta = 0
    for (let i = 0; i < n; i++) {
      next[i] += spread
      delta += Math.abs(next[i] - rank[i])
    }
    rank = next
    if (delta < CONVERGENCE) break
  }
  return new Map(urls.map((u, i) => [u, rank[i]]))
}

// 泛化锚文本（spec S3 §4）：比较前去空白、标点、箭头，转小写。
const GENERIC_ANCHORS = new Set([
  'clickhere', 'here', 'readmore', 'learnmore', 'more', 'details', 'link', 'this', 'seemore', 'viewmore', 'continue', 'continuereading',
  '查看更多', '更多', '点击这里', '点此', '详情', '了解更多', '阅读更多', '查看详情', '这里', '点击查看', '阅读全文',
])
export function isGenericAnchor(anchor: string): boolean {
  const key = anchor.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
  return key === '' || GENERIC_ANCHORS.has(key)
}

// 分页 / 标签 / 归档类路径：天然大量入链，但本身不是承接流量的目标页。
function isPaginationOrArchive(url: string): boolean {
  try {
    const u = new URL(url)
    if (/\/page\/\d+\/?$/i.test(u.pathname)) return true
    if (/(^|\/)(tag|tags)(\/|$)/i.test(u.pathname)) return true
    // 不含 p：WordPress 朴素固定链接 /?p=101 是文章 ID（第三轮独立审查 P1-8）
    for (const key of ['page', 'pg', 'paged']) if (/^\d+$/.test(u.searchParams.get(key) ?? '')) return true
    return false
  } catch {
    return false
  }
}

function relativeToMedian(rank: Map<string, number>, urls: string[]): Map<string, number> {
  const values = urls.map((u) => rank.get(u) ?? 0).sort((a, b) => a - b)
  const mid = values.length / 2
  const median = values.length % 2 ? values[Math.floor(mid)] : (values[mid - 1] + values[mid]) / 2
  return new Map(urls.map((u) => [u, median > 0 ? (rank.get(u) ?? 0) / median : 0]))
}

const cache = new WeakMap<object, WeakMap<object, LinkEquity | null>>()

export function analyzeLinkEquity(input: {
  payload: { pages: SiteAuditPage[]; linkGraph?: LinkGraphPayload | null }
  queryPageMetrics: { page: string; clicks: number; impressions: number; evidenceId?: string | null }[]
}): LinkEquity | null {
  const byMetrics = cache.get(input.payload)
  if (byMetrics?.has(input.queryPageMetrics)) return byMetrics.get(input.queryPageMetrics)!
  const result = compute(input)
  const m = byMetrics ?? new WeakMap()
  m.set(input.queryPageMetrics, result)
  if (!byMetrics) cache.set(input.payload, m)
  return result
}

function compute(input: {
  payload: { pages: SiteAuditPage[]; linkGraph?: LinkGraphPayload | null }
  queryPageMetrics: { page: string; clicks: number; impressions: number; evidenceId?: string | null }[]
}): LinkEquity | null {
  const graph = readLinkGraph(input.payload)
  if (!graph) return null
  if ((graph.nodeByUrl.get(graph.entryUrl)?.outInternal ?? 0) === 0) return null
  const htmlUrls = graph.nodes.filter((n) => n.html).map((n) => n.url)
  if (htmlUrls.length < MIN_HTML_PAGES) return null

  const rank = internalPageRank(graph)
  const relative = relativeToMedian(rank, htmlUrls)
  const htmlSet = new Set(htmlUrls)

  // GSC 页面数据对齐到图谱节点：归一化 + nodeFor（跳转前地址并入最终 URL），同页多查询求和（Review Focus 1）。
  const gsc = new Map<string, { clicks: number; impressions: number; evidenceIds: Set<string> }>()
  for (const m of input.queryPageMetrics) {
    const key = normalizeUrl(m.page) ?? m.page
    // 百分号编码大小写可能不一致（%e5 vs %E5）：先按原样找，再试大写形式
    const node = graph.nodeFor(key) ?? graph.nodeFor(key.replace(/%[0-9a-f]{2}/gi, (x) => x.toUpperCase()))
    if (!node || !htmlSet.has(node.url) || node.url === graph.entryUrl) continue
    const acc = gsc.get(node.url) ?? { clicks: 0, impressions: 0, evidenceIds: new Set<string>() }
    acc.clicks += m.clicks
    acc.impressions += m.impressions
    if (m.evidenceId) acc.evidenceIds.add(m.evidenceId)
    gsc.set(node.url, acc)
  }
  const hasGsc = input.queryPageMetrics.length > 0
  const eligible = [...gsc]
    .filter(([, v]) => v.clicks >= 1 || v.impressions >= GSC_MIN_IMPRESSIONS)
    .sort((a, b) => b[1].clicks - a[1].clicks || b[1].impressions - a[1].impressions || a[0].localeCompare(b[0]))
  const gscTop = new Set(eligible.slice(0, Math.ceil(eligible.length * VALUE_TOP_SHARE)).map(([u]) => u))

  const pageByNode = new Map<string, SiteAuditPage>()
  for (const p of input.payload.pages) {
    const key = graph.aliases.get(p.url) ?? p.url
    if (!pageByNode.has(key) || p.url === key) pageByNode.set(key, p)
  }
  // 入口页不作为高价值页：首页权重天然最高、入链天然来自导航（第三轮独立审查 P2-9：W03/W04 必然误报首页）。
  const keyPages = new Set(input.payload.pages.filter((p) => p.isKeyPage).map((p) => graph.nodeFor(p.url)?.url).filter((u): u is string => !!u && htmlSet.has(u) && u !== graph.entryUrl))

  const valuePages: ValuePage[] = [...new Set([...gscTop, ...keyPages])]
    .map((url) => ({
      url,
      source: (gscTop.has(url) && keyPages.has(url) ? 'both' : gscTop.has(url) ? 'gsc' : 'key') as ValuePage['source'],
      clicks: gsc.get(url)?.clicks ?? 0,
      impressions: gsc.get(url)?.impressions ?? 0,
      evidenceIds: gscTop.has(url) ? [...(gsc.get(url)?.evidenceIds ?? [])] : [],
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.url.localeCompare(b.url))

  // 低价值页：入口与高价值页本身不参与（首页天然权重最高，重点页由人工确认）。
  const valueSet = new Set(valuePages.map((v) => v.url))
  const lowValue = new Map<string, LowValueReason[]>()
  for (const url of htmlUrls) {
    if (url === graph.entryUrl || valueSet.has(url) || isUtilityPage(url)) continue
    const page = pageByNode.get(url)
    const reasons: LowValueReason[] = []
    if (page && isNoindex(page.metaRobots)) reasons.push('noindex')
    if (page && canonicalElsewhere(page)) reasons.push('canonical')
    if (isPaginationOrArchive(url)) reasons.push('pagination')
    if (reasons.length) lowValue.set(url, reasons)
  }

  return {
    graph,
    rank,
    relative,
    htmlCount: htmlUrls.length,
    coverage: htmlUrls.length / graph.nodes.length,
    valuePages,
    lowValue,
    hasGsc,
  }
}

// 站点结构页「内链权重」列：相对权重（× 中位数，保留 2 位小数）；只需图谱，不依赖 GSC。
export function equityRelativeFor(payload: { pages: SiteAuditPage[]; linkGraph?: LinkGraphPayload | null } | null): (url: string) => number | null {
  const equity = payload ? analyzeLinkEquity({ payload, queryPageMetrics: EMPTY_METRICS }) : null
  return (url) => {
    if (!equity) return null
    const node = equity.graph.nodeFor(url)
    const v = node ? equity.relative.get(node.url) : undefined
    return v === undefined ? null : Math.round(v * 100) / 100 // 页面按 <0.1× / N.N× 格式化
  }
}
const EMPTY_METRICS: { page: string; clicks: number; impressions: number }[] = []
