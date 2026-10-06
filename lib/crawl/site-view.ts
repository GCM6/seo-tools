import { readLinkGraph } from './link-graph'
import { analyzeLinkIntegrity, type LinkIntegrityInput } from './link-integrity'
import type { SiteAuditPayload } from './site-audit'

// 站点结构页的纯函数（spec S2 §5）：页面组件只负责渲染，取数口径在这里且与规则同源。

// 页面列表按本 run 快照过滤：site_pages 跨 run 累积，只展示本次快照里出现的 URL（修 S1 §9 已知缺口）。
export function filterToSnapshot<T extends { url: string }>(rows: T[], payload: Pick<SiteAuditPayload, 'pages'> | null): T[] {
  if (!payload) return rows
  const urls = new Set(payload.pages.map((p) => p.url))
  return rows.filter((r) => urls.has(r.url))
}

// 深度单元格：exact = 精确最短深度；upper = 只是上界（真实深度 ≤ depth，抓取未覆盖更浅的层）；
// unreachable = 闭包完整下确认首页不可达；no_path_found = 闭包不完整，只能说已抓范围内没找到路径。
export interface DepthCell {
  kind: 'exact' | 'upper' | 'unreachable' | 'no_path_found' | 'unknown'
  depth: number | null
  inAll: number | null
}

export function depthCellsFor(payload: Pick<SiteAuditPayload, 'linkGraph'> | null): (url: string) => DepthCell {
  const graph = payload ? readLinkGraph(payload) : null
  // 入口零站内出链：链接分析整体跳过（多为 JS 渲染导航），深度一律显示未知，不给确定性的「不可达」（第二轮独立审查 #8）。
  const entryNoLinks = graph !== null && (graph.nodeByUrl.get(graph.entryUrl)?.outInternal ?? 0) === 0
  return (url) => {
    const n = graph?.nodeFor(url)
    if (!graph || !n || entryNoLinks) return { kind: 'unknown', depth: null, inAll: n?.inAll ?? null }
    if (n.depth === null) return { kind: graph.closureComplete ? 'unreachable' : 'no_path_found', depth: null, inAll: n.inAll }
    return { kind: n.depthExact ? 'exact' : 'upper', depth: n.depth, inAll: n.inAll }
  }
}

export interface LinkStructureCounts {
  entryNoLinks: boolean
  reachable: number
  unreachableSitemap: number
  brokenTargets: number
  deadEnds: number
  exhaustive: boolean
  closureComplete: boolean
}

export function linkStructureCounts(payload: LinkIntegrityInput | null): LinkStructureCounts | null {
  const graph = payload ? readLinkGraph(payload) : null
  if (!payload || !graph) return null
  const base = {
    reachable: graph.summary.reachableNodes,
    unreachableSitemap: graph.summary.unreachableSitemapNodes,
    exhaustive: graph.exhaustive,
    closureComplete: graph.closureComplete,
  }
  const li = analyzeLinkIntegrity(payload)
  // 入口零站内出链：分析层整体跳过（多为 JS 渲染导航），页面只显示提示。
  if (!li) return { entryNoLinks: true, brokenTargets: 0, deadEnds: 0, ...base }
  return { entryNoLinks: false, brokenTargets: li.broken.length, deadEnds: li.deadEnds.length, ...base }
}

// 本次快照里的 HTTP 状态与抓取状态：site_pages 只保存最新一轮的值，查看历史 run 时要以快照为准（第二轮独立审查 #17）。
export function snapshotStatusFor(payload: Pick<SiteAuditPayload, 'pages'> | null): (url: string) => { httpStatus: number | null; checkStatus: string } | null {
  const byUrl = new Map((payload?.pages ?? []).map((p) => [p.url, { httpStatus: p.httpStatus, checkStatus: p.checkStatus }]))
  return (url) => byUrl.get(url) ?? null
}
