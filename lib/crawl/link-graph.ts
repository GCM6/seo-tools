import type { ContentKind, ExternalLinkDetail, InternalLinkDetail, LightCheckExtra, LinkRegion, LinkRel } from './light-check'
import { isSameSite } from './url'

// 站内链接图谱（spec S1 §6）：纯函数，输入本 run 页面，输出紧凑编码；规则一律经 readLinkGraph 解码读取。
// 深度语义 = 搜索引擎发现视角：只沿可跟随边（非 nofollow、源页出链已知且无 meta nofollow）扩展。
//
// 诚信标志的前提是「已解析 ⇒ 出链确实已知」（S1 修复波，独立审查 P1–P5 + 真实站点冒烟）。每页先派生出链状态：
//   complete —— 2xx HTML，链接未截断：出链完整已知
//   none     —— 404/410、图片/音视频等媒体、feed/CSS/JSON 等机器格式（同 sitemap 不属于 HTML 链接图）、跨站跳转
//   （PDF/Office 文档含可点击超链接、搜索引擎会跟随，本工具不解析 → unknown，第二轮独立审查 #2）
//   blocked  —— robots 禁抓：搜索引擎同样看不到出链（发现口径已解析），但真实出链未知
//   partial  —— 2xx HTML 但链接被截断：已知边照常展开，但可能漏边
//   unknown  —— 抓取失败、401/403/408/429/5xx、其他内容类型、未抓：出链未知
// 两个口径：发现口径（视界 H / closureComplete）complete|none|blocked 算已解析；
//           任意链接口径（exhaustive / 孤岛）只有 complete|none 算出链已知。
// 同站跳转：请求 URL 并入最终 URL 节点，指向请求 URL 的边改指最终 URL 并记 redirectedFrom（L02 用）。

export const LINK_GRAPH_VERSION = 2

export interface LinkGraphPageInput {
  url: string
  finalUrl?: string | null // 归一化后的最终 URL；null/未给/等于 url 表示未跳转
  checkStatus: string
  httpStatus: number | null
  metaRobots: string | null
  discoveredVia: string
  contentKind?: ContentKind | null // 历史数据缺省：有链接明细视为 html，否则 other
  linksTruncated?: boolean | null
  linkDetails: InternalLinkDetail[] | null
  externalLinks: ExternalLinkDetail[] | null
}

export type LinkState = 'complete' | 'none' | 'blocked' | 'partial' | 'unknown'

const REGIONS: LinkRegion[] = ['nav', 'header', 'footer', 'aside', 'main', 'body']
const RELS: LinkRel[] = ['nofollow', 'ugc', 'sponsored']

// 节点标志位
const N_RESOLVED = 1 // 发现口径已解析
const N_FETCHED = 2
const N_BLOCKED = 4
const N_ERROR = 8
const N_SITEMAP = 16
const N_META_NOFOLLOW = 32
const N_LINKS_KNOWN = 64 // 任意链接口径出链已知
const N_HTML = 128 // 已抓 2xx HTML 页面
const N_TRUNCATED = 256
const N_UNKNOWN = 512
// 边标志位
const E_NOFOLLOW = 1
const E_FOLLOWABLE = 2

type NodeTuple = [depth: number | null, flags: number, inFollow: number, inAll: number, outInternal: number, outExternal: number, httpStatus: number | null]
// 第 7 位（可选）：经跳转时的原始目标 URL。
type EdgeTuple = [src: number, dst: number, count: number, regionMask: number, flags: number, anchorIdx: number[], redirectedFrom?: string]
// 第 7 位（可选）：原始 href（与归一化 url 不同时），站外抽检请求它（第二轮独立审查 #6）。
type ExternalTuple = [src: number, url: string, host: string, anchorIdx: number, regionIdx: number, relMask: number, href?: string]

export interface LinkGraphSummary {
  nodes: number
  resolvedNodes: number
  reachableNodes: number
  unreachableSitemapNodes: number
  edges: number
  followableEdges: number
  externalLinks: number
}

export interface LinkGraphPayload {
  version: typeof LINK_GRAPH_VERSION
  entry: number
  entryRequested: string // 请求的入口 URL（入口跳转时与节点 URL 不同）
  // 深度精确视界 H：已到达、发现口径未解析节点的最小深度；null = ∞。深度 ≤ H 为精确值。
  exactDepthHorizon: number | null
  // 闭包完整 = H 为 ∞：只有此时「首页不可达（沿可跟随链接）」才能下实测结论。
  closureComplete: boolean
  // 抓取穷尽 = 所有节点出链已知：只有此时「没有任何页面链到它」才能下实测结论。
  exhaustive: boolean
  summary: LinkGraphSummary
  urls: string[]
  anchors: string[]
  aliases: [from: string, toIdx: number][]
  nodes: NodeTuple[]
  edges: EdgeTuple[]
  external: ExternalTuple[]
}

export interface LinkGraphNode {
  url: string
  depth: number | null
  depthExact: boolean
  linkState: LinkState
  resolved: boolean
  linksKnown: boolean
  fetched: boolean
  html: boolean
  blocked: boolean
  error: boolean
  truncated: boolean
  inSitemap: boolean
  metaNofollow: boolean
  httpStatus: number | null
  inFollow: number
  inAll: number
  outInternal: number
  outExternal: number
}

export interface LinkGraphEdge {
  from: string
  to: string
  count: number
  regions: LinkRegion[]
  nofollow: boolean
  followable: boolean
  anchors: string[]
  redirectedFrom?: string
}

export interface LinkGraphExternal {
  from: string
  url: string
  host: string
  anchor: string
  region: LinkRegion
  rel: LinkRel[]
  href?: string
}

export interface LinkGraphView {
  version: number
  entryUrl: string
  entryRequestedUrl: string
  exactDepthHorizon: number | null
  closureComplete: boolean
  exhaustive: boolean
  summary: LinkGraphSummary
  nodes: LinkGraphNode[]
  nodeByUrl: Map<string, LinkGraphNode>
  aliases: Map<string, string>
  // 按任意 URL（含已并入的跳转请求 URL）取节点。
  nodeFor: (url: string) => LinkGraphNode | undefined
  edges: LinkGraphEdge[]
  external: LinkGraphExternal[]
}

const isMetaNofollow = (metaRobots: string | null) => /(^|[\s,])(nofollow|none)([\s,]|$)/i.test(metaRobots ?? '')
const mask = <T>(all: T[], values: T[]) => values.reduce((m, v) => (all.includes(v) ? m | (1 << all.indexOf(v)) : m), 0)
const unmask = <T>(all: T[], m: number) => all.filter((_, i) => (m & (1 << i)) !== 0)
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function interner() {
  const list: string[] = []
  const index = new Map<string, number>()
  const id = (s: string) => {
    let i = index.get(s)
    if (i === undefined) {
      i = list.length
      list.push(s)
      index.set(s, i)
    }
    return i
  }
  return { list, id }
}

function linkStateOf(p: LinkGraphPageInput, crossSite: boolean): LinkState {
  if (p.checkStatus === 'blocked_by_robots') return 'blocked'
  if (p.checkStatus !== 'checked') return 'unknown'
  if (crossSite) return 'none'
  const s = p.httpStatus ?? 0
  if (s === 404 || s === 410) return 'none'
  if (s < 200 || s >= 300) return 'unknown'
  const kind = p.contentKind ?? (p.linkDetails ? 'html' : 'other')
  if (kind === 'media' || kind === 'resource') return 'none'
  if (kind !== 'html') return 'unknown' // document / other
  return p.linksTruncated ? 'partial' : 'complete'
}

const DISCOVERY_RESOLVED: ReadonlySet<LinkState> = new Set(['complete', 'none', 'blocked'])
const LINKS_KNOWN: ReadonlySet<LinkState> = new Set(['complete', 'none'])

// 爬虫结果 / site_pages 行 → 图谱输入（collect-evidence、测试、冒烟脚本共用，避免各自漏字段）。
export function toLinkGraphInput(row: {
  url: string
  finalUrl?: string | null
  checkStatus: string
  httpStatus: number | null
  metaRobots: string | null
  discoveredVia: string
  linkDetails?: InternalLinkDetail[] | null
  externalLinks?: ExternalLinkDetail[] | null
  extra?: Pick<LightCheckExtra, 'contentKind' | 'linkDetailsTruncated'> | null
}): LinkGraphPageInput {
  return {
    url: row.url,
    finalUrl: row.finalUrl ?? null,
    checkStatus: row.checkStatus,
    httpStatus: row.httpStatus,
    metaRobots: row.metaRobots,
    discoveredVia: row.discoveredVia,
    contentKind: row.extra?.contentKind ?? null,
    linksTruncated: row.extra?.linkDetailsTruncated ?? null,
    linkDetails: row.linkDetails ?? null,
    externalLinks: row.externalLinks ?? null,
  }
}

export function buildLinkGraph(input: { entryUrl: string; pages: LinkGraphPageInput[] }): LinkGraphPayload {
  const host = hostOf(input.entryUrl)
  const isCrossSite = (p: LinkGraphPageInput) => !!p.finalUrl && p.finalUrl !== p.url && !isSameSite(p.finalUrl, host)

  // 同站跳转别名：请求 URL → 最终 URL。
  const alias = new Map<string, string>()
  for (const p of input.pages) {
    if (p.finalUrl && p.finalUrl !== p.url && !isCrossSite(p)) alias.set(p.url, p.finalUrl)
  }
  const resolveUrl = (u: string) => alias.get(u) ?? u

  // 每个节点的有效页面：优先直接抓到的最终 URL 记录，其次任一并入它的跳转记录。
  const effective = new Map<string, LinkGraphPageInput>()
  const sitemapKeys = new Set<string>()
  for (const p of input.pages) {
    const key = resolveUrl(p.url)
    if (!effective.has(key) || p.url === key) effective.set(key, p)
    if (p.discoveredVia === 'sitemap' || p.discoveredVia === 'both') sitemapKeys.add(key)
  }

  const urls = interner()
  const anchors = interner()
  const entry = urls.id(resolveUrl(input.entryUrl))
  const stateByIdx = new Map<number, LinkState>()
  const pageByIdx = new Map<number, LinkGraphPageInput>()
  for (const [key, p] of effective) {
    const i = urls.id(key)
    pageByIdx.set(i, p)
    stateByIdx.set(i, linkStateOf(p, isCrossSite(p)))
  }
  const stateOf = (i: number): LinkState => stateByIdx.get(i) ?? 'unknown'

  type EdgeAcc = { count: number; regions: Set<LinkRegion>; anyFollow: boolean; anchors: string[]; redirectedFrom?: string }
  const edgeAcc = new Map<number, Map<number, EdgeAcc>>()
  const external: ExternalTuple[] = []
  const outExternal = new Map<number, number>()

  for (const [src, p] of pageByIdx) {
    const state = stateOf(src)
    // 只有出链有意义的页（完整或截断的 HTML）贡献边；禁抓/错误/媒体/跨站跳转不贡献。
    if (state !== 'complete' && state !== 'partial') continue
    const accs = edgeAcc.get(src) ?? new Map<number, EdgeAcc>()
    edgeAcc.set(src, accs)
    const srcUrl = urls.list[src]
    for (const d of p.linkDetails ?? []) {
      const target = resolveUrl(d.url)
      if (target === srcUrl) continue
      const dst = urls.id(target)
      let acc = accs.get(dst)
      if (!acc) accs.set(dst, (acc = { count: 0, regions: new Set(), anyFollow: false, anchors: [] }))
      acc.count += d.count
      d.regions.forEach((r) => acc!.regions.add(r))
      if (!d.nofollow) acc.anyFollow = true
      for (const a of d.anchors) if (!acc.anchors.includes(a) && acc.anchors.length < 3) acc.anchors.push(a)
      if (target !== d.url && acc.redirectedFrom === undefined) acc.redirectedFrom = d.url
    }
    const ext = p.externalLinks ?? []
    for (const x of ext) {
      const tuple: ExternalTuple = [src, x.url, x.host, anchors.id(x.anchor), Math.max(0, REGIONS.indexOf(x.region)), mask(RELS, x.rel)]
      if (x.href) tuple.push(x.href)
      external.push(tuple)
    }
    outExternal.set(src, ext.length)
  }

  const edges: EdgeTuple[] = []
  const adjacency = new Map<number, number[]>()
  const inFollow = new Map<number, Set<number>>()
  const inAll = new Map<number, Set<number>>()
  const outInternal = new Map<number, number>()
  const addIn = (m: Map<number, Set<number>>, dst: number, src: number) => {
    let s = m.get(dst)
    if (!s) m.set(dst, (s = new Set()))
    s.add(src)
  }
  for (const [src, accs] of edgeAcc) {
    const sourceFollows = !isMetaNofollow(pageByIdx.get(src)?.metaRobots ?? null)
    for (const [dst, acc] of accs) {
      const followable = sourceFollows && acc.anyFollow
      const tuple: EdgeTuple = [src, dst, acc.count, mask(REGIONS, [...acc.regions]), (acc.anyFollow ? 0 : E_NOFOLLOW) | (followable ? E_FOLLOWABLE : 0), acc.anchors.map(anchors.id)]
      if (acc.redirectedFrom !== undefined) tuple.push(acc.redirectedFrom)
      edges.push(tuple)
      addIn(inAll, dst, src)
      if (followable) {
        addIn(inFollow, dst, src)
        const adj = adjacency.get(src) ?? []
        adj.push(dst)
        adjacency.set(src, adj)
      }
    }
    outInternal.set(src, accs.size)
  }

  // BFS：从入口沿可跟随边求最短点击深度。
  const depth: (number | null)[] = urls.list.map(() => null)
  depth[entry] = 0
  const queue = [entry]
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi]
    for (const v of adjacency.get(u) ?? []) {
      if (depth[v] !== null) continue
      depth[v] = depth[u]! + 1
      queue.push(v)
    }
  }

  let horizon: number | null = null
  for (let i = 0; i < urls.list.length; i++) {
    const d = depth[i]
    if (d !== null && !DISCOVERY_RESOLVED.has(stateOf(i)) && (horizon === null || d < horizon)) horizon = d
  }

  const nodes: NodeTuple[] = urls.list.map((url, i) => {
    const p = pageByIdx.get(i)
    const state = stateOf(i)
    const s = p?.httpStatus ?? 0
    const flags =
      (DISCOVERY_RESOLVED.has(state) ? N_RESOLVED : 0) |
      (LINKS_KNOWN.has(state) ? N_LINKS_KNOWN : 0) |
      (p?.checkStatus === 'checked' ? N_FETCHED : 0) |
      (p?.checkStatus === 'checked' && s >= 200 && s < 300 && (state === 'complete' || state === 'partial') ? N_HTML : 0) |
      (state === 'blocked' ? N_BLOCKED : 0) |
      (p?.checkStatus === 'error' ? N_ERROR : 0) |
      (state === 'partial' ? N_TRUNCATED : 0) |
      (state === 'unknown' ? N_UNKNOWN : 0) |
      (sitemapKeys.has(url) ? N_SITEMAP : 0) |
      (p && isMetaNofollow(p.metaRobots) ? N_META_NOFOLLOW : 0)
    return [depth[i], flags, inFollow.get(i)?.size ?? 0, inAll.get(i)?.size ?? 0, outInternal.get(i) ?? 0, outExternal.get(i) ?? 0, p?.httpStatus ?? null]
  })

  const linksKnownCount = nodes.filter((n) => n[1] & N_LINKS_KNOWN).length
  return {
    version: LINK_GRAPH_VERSION,
    entry,
    entryRequested: input.entryUrl,
    exactDepthHorizon: horizon,
    closureComplete: horizon === null,
    exhaustive: linksKnownCount === urls.list.length,
    summary: {
      nodes: urls.list.length,
      resolvedNodes: nodes.filter((n) => n[1] & N_RESOLVED).length,
      reachableNodes: nodes.filter((n) => n[0] !== null).length,
      unreachableSitemapNodes: nodes.filter((n) => n[0] === null && n[1] & N_SITEMAP).length,
      edges: edges.length,
      followableEdges: edges.filter((e) => e[4] & E_FOLLOWABLE).length,
      externalLinks: external.length,
    },
    urls: urls.list,
    anchors: anchors.list,
    aliases: [...alias].map(([from, to]) => [from, urls.id(to)]),
    nodes,
    edges,
    external,
  }
}

function stateFromFlags(flags: number): LinkState {
  if (flags & N_BLOCKED) return 'blocked'
  if (flags & N_TRUNCATED) return 'partial'
  if (flags & N_UNKNOWN) return 'unknown'
  if (flags & N_LINKS_KNOWN) return flags & N_HTML ? 'complete' : 'none'
  return 'unknown'
}

export function readLinkGraph(payload: { linkGraph?: LinkGraphPayload | null } | null | undefined): LinkGraphView | null {
  const g = payload?.linkGraph
  // 只解码当前版本：旧版本标志位语义不同，按 null 处理让规则回退旧逻辑（第二轮独立审查 #18）。
  if (!g || g.version !== LINK_GRAPH_VERSION) return null
  const h = g.exactDepthHorizon
  const nodes: LinkGraphNode[] = g.nodes.map(([depth, flags, inF, inA, oI, oE, httpStatus], i) => ({
    url: g.urls[i],
    depth,
    depthExact: depth !== null && (h === null || depth <= h),
    linkState: stateFromFlags(flags),
    resolved: (flags & N_RESOLVED) !== 0,
    linksKnown: (flags & N_LINKS_KNOWN) !== 0,
    fetched: (flags & N_FETCHED) !== 0,
    html: (flags & N_HTML) !== 0,
    blocked: (flags & N_BLOCKED) !== 0,
    error: (flags & N_ERROR) !== 0,
    truncated: (flags & N_TRUNCATED) !== 0,
    inSitemap: (flags & N_SITEMAP) !== 0,
    metaNofollow: (flags & N_META_NOFOLLOW) !== 0,
    httpStatus,
    inFollow: inF,
    inAll: inA,
    outInternal: oI,
    outExternal: oE,
  }))
  const nodeByUrl = new Map(nodes.map((n) => [n.url, n]))
  const aliases = new Map((g.aliases ?? []).map(([from, to]) => [from, g.urls[to]]))
  return {
    version: g.version,
    entryUrl: g.urls[g.entry],
    entryRequestedUrl: g.entryRequested ?? g.urls[g.entry],
    exactDepthHorizon: h,
    closureComplete: g.closureComplete,
    exhaustive: g.exhaustive,
    summary: g.summary,
    nodes,
    nodeByUrl,
    aliases,
    nodeFor: (url) => nodeByUrl.get(aliases.get(url) ?? url),
    edges: g.edges.map(([src, dst, count, regionMask, flags, anchorIdx, redirectedFrom]) => ({
      from: g.urls[src],
      to: g.urls[dst],
      count,
      regions: unmask(REGIONS, regionMask),
      nofollow: (flags & E_NOFOLLOW) !== 0,
      followable: (flags & E_FOLLOWABLE) !== 0,
      anchors: anchorIdx.map((a) => g.anchors[a]),
      ...(redirectedFrom !== undefined ? { redirectedFrom } : {}),
    })),
    external: g.external.map(([src, url, host, anchorI, regionI, relMask, href]) => ({
      from: g.urls[src],
      url,
      host,
      anchor: g.anchors[anchorI],
      region: REGIONS[regionI] ?? 'body',
      rel: unmask(RELS, relMask),
      ...(href !== undefined ? { href } : {}),
    })),
  }
}

// 全部入链的不同源页数（含 nofollow，与旧 inboundLinkCount 口径一致），写回 site_pages 用。
// 已并入最终 URL 的跳转请求 URL 取其最终节点的入度（sitemap 列了跳转前 URL 时不误判孤岛）。
export function inboundAllByUrl(graph: LinkGraphPayload): Record<string, number> {
  const out: Record<string, number> = {}
  graph.nodes.forEach((n, i) => {
    out[graph.urls[i]] = n[3]
  })
  for (const [from, to] of graph.aliases ?? []) out[from] = graph.nodes[to][3]
  return out
}
