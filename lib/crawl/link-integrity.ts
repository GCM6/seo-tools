import { readLinkGraph, type LinkGraphEdge, type LinkGraphExternal, type LinkGraphPayload, type LinkGraphView } from './link-graph'
import type { SiteAuditPage } from './site-audit'
import type { ExternalCheckResult } from './external-check'
import { normalizeUrl, isSameSite } from './url'

// 链接完整性分析（spec S2 §3）：规则 L01–L07 与站点结构页共用的唯一计算源，避免两处各算一套。
// 纯函数：只读 site_audit 快照（pages + linkGraph + externalChecks）。只对已抓目标下结论。

export interface LinkIntegrityInput {
  pages: SiteAuditPage[]
  linkGraph?: LinkGraphPayload | null
  externalChecks?: ExternalCheckResult[] | null
}

export interface TargetRow {
  url: string
  httpStatus: number | null
  finalUrl?: string | null
  reason?: 'noindex' | 'canonical' | 'redirect_loop'
  edges: LinkGraphEdge[]
}

export interface ExternalBrokenRow {
  url: string
  status: number
  sources: LinkGraphExternal[]
}

export interface LinkIntegrity {
  graph: LinkGraphView
  broken: TargetRow[]
  redirects: TargetRow[]
  nonIndexable: TargetRow[]
  islands: string[]
  islandsExact: boolean
  nofollowOnly: string[]
  nofollowOnlyExact: boolean
  deadEnds: string[]
  deadEndSuspect: boolean
  unverifiedTargets: number
  errorTargets: number
  externalBroken: ExternalBrokenRow[]
  externalUnverified: number
}

// 已抓 200 页中死胡同占比达到该值 → 判为链接抽取失败（导航靠 JS 输出），不报死胡同（spec S2 §3）。
export const DEAD_END_SUSPECT_RATIO = 0.5
const EXTERNAL_BROKEN_STATUSES = new Set([404, 410])
// 站内断链同样只认 404/410：403/429 常是反爬、5xx 常是临时故障，单次测量不能断言「坏链」（审查 P1 同源）。
const BROKEN_STATUSES = new Set([404, 410])
// 重定向循环（safeFetch 在 Cookie 不变时重访同一 URL）与 404 一样是确定性故障：浏览器显示「重定向次数过多」（2026-10-03 jac.com.cn 冒烟）。
const REDIRECT_LOOP = /redirect loop/i

export const isNoindex = (metaRobots: string | null | undefined) => /(^|[\s,])(noindex|none)([\s,]|$)/i.test(metaRobots ?? '')

// 法律/账户/购物车/站内搜索等功能页：本就不该被收录，全站链接到它们是正常做法，不计入 L03
// （2026-09-29 真实站点冒烟：隐私/条款页 noindex 被全站页脚链接，报出来是噪音）。
// 只认精确段名（可带 .html/.php 等扩展名）：前缀匹配会误伤 /legal-services、/privacy-screen-protectors 等
// 正常内容页（第二轮独立审查 #12）。
const UTILITY_SEGMENT = /^(privacy|privacy-policy|privacy-notice|terms|terms-of-service|terms-of-use|terms-and-conditions|tos|cookies|cookie-policy|legal|legal-notice|imprint|impressum|disclaimer|login|log-in|signin|sign-in|signup|sign-up|register|account|my-account|cart|basket|checkout|search)(\.(html?|php|aspx?))?$/i
export function isUtilityPage(url: string): boolean {
  try {
    return new URL(url).pathname.split('/').some((seg) => UTILITY_SEGMENT.test(seg))
  } catch {
    return false
  }
}

// 沿全部边（含 nofollow、含 meta nofollow 源页）从入口 BFS（L04/L05 用）。complete = 到达节点出链全部已知
// （禁抓、截断、出错页的出链未知，可能正是通向孤岛的那条路）。
export function reachableViaAnyLink(view: LinkGraphView): { urls: Set<string>; complete: boolean } {
  const out = new Map<string, string[]>()
  for (const e of view.edges) {
    const list = out.get(e.from) ?? []
    list.push(e.to)
    out.set(e.from, list)
  }
  const urls = new Set([view.entryUrl])
  const queue = [view.entryUrl]
  for (let i = 0; i < queue.length; i++) {
    for (const v of out.get(queue[i]) ?? []) {
      if (urls.has(v)) continue
      urls.add(v)
      queue.push(v)
    }
  }
  const complete = [...urls].every((u) => view.nodeByUrl.get(u)?.linksKnown ?? false)
  return { urls, complete }
}

// canonical 归一化后指向本站另一个 URL（跳转页以最终 URL 为自身）。
export function canonicalElsewhere(page: Pick<SiteAuditPage, 'url' | 'finalUrl' | 'canonicalUrl'>): boolean {
  if (!page.canonicalUrl) return false
  const canonical = normalizeUrl(page.canonicalUrl, page.finalUrl ?? page.url)
  const self = normalizeUrl(page.finalUrl ?? page.url)
  if (!canonical || !self) return false
  const host = new URL(self).hostname.replace(/^www\./, '')
  return isSameSite(canonical, host) && canonical !== self
}

const byEdgesThenUrl = (a: TargetRow, b: TargetRow) => b.edges.length - a.edges.length || a.url.localeCompare(b.url)

export function analyzeLinkIntegrity(input: LinkIntegrityInput): LinkIntegrity | null {
  const graph = readLinkGraph(input)
  if (!graph) return null
  // 入口页零站内出链：多为 JS 渲染导航，初始 HTML 抽不到链接，链接类结论不可信（同 T05 守卫）。
  if ((graph.nodeByUrl.get(graph.entryUrl)?.outInternal ?? 0) === 0) return null

  // 节点 → 页面记录：跳转请求 URL 已并入最终 URL 节点，优先直接抓到最终 URL 的记录。
  const pageByNode = new Map<string, SiteAuditPage>()
  for (const p of input.pages) {
    const key = graph.aliases.get(p.url) ?? p.url
    if (!pageByNode.has(key) || p.url === key) pageByNode.set(key, p)
  }
  const incoming = new Map<string, LinkGraphEdge[]>()
  for (const e of graph.edges) {
    const list = incoming.get(e.to) ?? []
    list.push(e)
    incoming.set(e.to, list)
  }
  const edgesTo = (url: string, followableOnly = false) =>
    (incoming.get(url) ?? []).filter((e) => !followableOnly || e.followable)

  const fetched = graph.nodes.filter((n) => n.fetched)
  const ok = graph.nodes.filter((n) => n.html && n.httpStatus === 200)

  // 抓取失败（status 0：超时、连接失败、跳转过多/循环）的节点；错误原因只在页面记录上。
  const failed = graph.nodes.filter((n) => n.error || (pageByNode.get(n.url)?.checkStatus === 'error'))
  const isLoop = (url: string) => REDIRECT_LOOP.test(pageByNode.get(url)?.errorReason ?? '')
  const broken: TargetRow[] = [
    ...fetched.filter((n) => BROKEN_STATUSES.has(n.httpStatus ?? 0)).map((n) => ({ url: n.url, httpStatus: n.httpStatus, edges: edgesTo(n.url) })),
    ...failed.filter((n) => isLoop(n.url)).map((n) => ({ url: n.url, httpStatus: null, reason: 'redirect_loop' as const, edges: edgesTo(n.url) })),
  ]
    .filter((r) => r.edges.length > 0)
    .sort(byEdgesThenUrl)
  const errorTargets =
    fetched.filter((n) => (n.httpStatus ?? 0) >= 400 && !BROKEN_STATUSES.has(n.httpStatus ?? 0) && n.inAll > 0).length +
    failed.filter((n) => !isLoop(n.url) && n.inAll > 0).length

  // 指向跳转：图谱里经跳转的边带 redirectedFrom（原始目标）。入口 URL 跳转（语言/地区分流）多为有意设计，
  // 链回首页不算（spec S2 Review Focus 1）。
  // 只报最终能正常打开（< 400）的跳转：跳到 404/5xx 的改成最终地址也是坏的，由 L01/错误计数处理（第二轮独立审查 #3）。
  const redirectGroups = new Map<string, LinkGraphEdge[]>()
  for (const e of graph.edges) {
    if (!e.redirectedFrom || e.redirectedFrom === graph.entryRequestedUrl) continue
    // 目标抓取失败（status 0/未知）同样打不开，不能建议「改成最终地址」（2026-10-03 jac.com.cn 冒烟）。
    const finalStatus = graph.nodeByUrl.get(e.to)?.httpStatus ?? 0
    if (finalStatus < 200 || finalStatus >= 400) continue
    const list = redirectGroups.get(e.redirectedFrom) ?? []
    list.push(e)
    redirectGroups.set(e.redirectedFrom, list)
  }
  const redirects: TargetRow[] = [...redirectGroups]
    .map(([from, edges]) => ({ url: from, finalUrl: edges[0].to, httpStatus: graph.nodeByUrl.get(edges[0].to)?.httpStatus ?? null, edges }))
    .sort(byEdgesThenUrl)

  const nonIndexable: TargetRow[] = ok
    .filter((n) => !isUtilityPage(n.url))
    .map((n) => {
      const page = pageByNode.get(n.url)
      const reason: TargetRow['reason'] | null = !page ? null : isNoindex(page.metaRobots) ? 'noindex' : canonicalElsewhere(page) ? 'canonical' : null
      return reason ? { url: n.url, httpStatus: n.httpStatus, reason, edges: edgesTo(n.url, true) } : null
    })
    .filter((r): r is TargetRow & { reason: 'noindex' | 'canonical' } => r !== null && r.edges.length > 0)
    .sort(byEdgesThenUrl)

  const anyReach = reachableViaAnyLink(graph)
  const indexableOk = ok.filter((n) => !isNoindex(pageByNode.get(n.url)?.metaRobots))
  // inAll=0 的 sitemap 页由 T05 负责，这里只报「有入链但首页到不了」的孤岛群，避免重复命中。
  const islands = indexableOk
    .filter((n) => n.inSitemap && n.depth === null && !anyReach.urls.has(n.url) && n.inAll > 0)
    .map((n) => n.url)
    .sort()
  const nofollowOnly = indexableOk
    .filter((n) => n.depth === null && anyReach.urls.has(n.url))
    .map((n) => n.url)
    .sort()

  // 死胡同只看出链完整已知的页（截断页可能只是链接太多被截断）。
  const contentPages = ok.filter((n) => n.url !== graph.entryUrl && n.linkState === 'complete' && (pageByNode.get(n.url)?.mainTextChars ?? 0) > 0)
  const deadAll = contentPages.filter((n) => n.outInternal === 0).map((n) => n.url).sort()
  const deadEndSuspect = contentPages.length > 0 && deadAll.length / contentPages.length >= DEAD_END_SUSPECT_RATIO

  const checks = input.externalChecks ?? []
  const externalBroken: ExternalBrokenRow[] = checks
    .filter((c): c is ExternalCheckResult & { status: number } => c.status !== null && EXTERNAL_BROKEN_STATUSES.has(c.status))
    .map((c) => ({ url: c.url, status: c.status, sources: graph.external.filter((x) => x.url === c.url) }))
    // 没有本站来源的结果不下结论（可能来自跨站跳转页的第三方 HTML，第二轮独立审查 #4）。
    .filter((b) => b.sources.length > 0)
    .sort((a, b) => b.sources.length - a.sources.length || a.url.localeCompare(b.url))
  // 返回了其他错误的（不含截止时间内未检测的 not_checked）：可能是临时故障或反爬，只计数。
  const externalUnverified = checks.filter((c) => (c.error !== null && c.error !== 'not_checked') || ((c.status ?? 0) >= 400 && !EXTERNAL_BROKEN_STATUSES.has(c.status!))).length

  return {
    graph,
    broken,
    redirects,
    nonIndexable,
    islands,
    islandsExact: anyReach.complete,
    nofollowOnly,
    nofollowOnlyExact: graph.closureComplete,
    deadEnds: deadEndSuspect ? [] : deadAll,
    deadEndSuspect,
    // 被链接但本次未拿到状态码的目标（未抓、禁抓、抓取失败）：不下结论，只计数。
    unverifiedTargets: graph.nodes.filter((n) => !n.fetched && n.inAll > 0).length,
    errorTargets,
    externalBroken,
    externalUnverified,
  }
}
