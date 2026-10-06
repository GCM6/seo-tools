import { normalizeUrl, isSameSite } from './url'
import type { LightCheckExtra } from './light-check'
import { readLinkGraph, type LinkGraphPayload } from './link-graph'
import type { ExternalCheckResult } from './external-check'

// site_audit：一次 run 的全站轻检不可变快照（存 evidence payload）。
// site_pages 表是「当前状态」，本快照才是 findings 引用与 retest 对比的锚。

export interface SiteAuditPage {
  url: string
  discoveredVia: string
  depth: number | null
  httpStatus: number | null
  finalUrl: string | null
  title?: string | null
  canonicalUrl: string | null
  metaRobots: string | null
  mainTextChars: number | null
  inboundLinkCount: number
  // 出向同站内链（归一化 URL）：TA01/TA02 用它重建「忠实群内有向邻接」（区别于全站聚合 inboundLinkCount）。
  // 历史证据无此字段时为 undefined/null，规则回退全站入度近似（SP-A2 #2）。
  internalLinks?: string[] | null
  checkStatus: string
  errorReason: string | null
  isKeyPage: boolean
  // 正文哈希：C10 精确重复内容检测（同 hash 即逐字重复）。历史证据无此字段时为 null。
  contentHash?: string | null
  templateId?: string | null
  // 轻检扩展信号（viewport/hreflang/alt/结构/协议/重定向）。历史证据无此字段时为 null，
  // 消费规则（T06/T08/T13/T14/C09/C11）遇 null 跳过该页。
  lightCheckExtra?: LightCheckExtra | null
}

export interface SiteAuditTemplate { pattern: string; pageCount: number; representativeUrl: string | null }

export interface SiteAuditPayload {
  // crawlStrategy/sitemapReserveRatio 自 S1 起记录；旧快照缺省视为 sitemap_first_v0（spec S1 §8 重测兼容）。
  protocol: {
    maxPages: number
    maxDepth: number
    crawlStrategy?: string
    sitemapReserveRatio?: number
    // 站外链接抽检协议（spec S2 §4）：cap=抽检上限，checked=实际检测数，skippedUrls=反爬平台跳过数。
    externalCheck?: { cap: number; checked: number; skippedUrls: number; failedBatches?: number }
  }
  stats: {
    totalDiscovered: number
    checked: number
    truncated: number
    http4xx: number
    http5xx: number
    errors: number
    blockedByRobots: number
    noindex: number
    canonicalOffsite: number
    orphanPages: number
    citedPages: number
  }
  pages: SiteAuditPage[]
  templates: SiteAuditTemplate[]
  citations: { url: string; count: number }[]
  // 站内链接图谱（spec S1 §6）：历史证据无此字段，规则经 readLinkGraph 取得 null 后回退旧逻辑。
  linkGraph?: LinkGraphPayload
  // 站外链接单次抽检结果（spec S2 §4）：L07 只对 404/410 下结论。历史证据无此字段。
  externalChecks?: ExternalCheckResult[]
}

const isNoindex = (p: SiteAuditPage) => (p.metaRobots ?? '').toLowerCase().includes('noindex')

function isCanonicalOffsite(p: SiteAuditPage, entryHost: string): boolean {
  if (!p.canonicalUrl) return false
  const n = normalizeUrl(p.canonicalUrl, p.url)
  return n !== null && !isSameSite(n, entryHost)
}

// 孤岛：sitemap 声明了、但全站内链入度为 0（入口页除外）。
const isOrphan = (p: SiteAuditPage) =>
  p.discoveredVia === 'sitemap' && p.inboundLinkCount === 0 && p.checkStatus === 'checked'

export function buildSiteAudit(input: {
  pages: SiteAuditPage[]
  templates: SiteAuditTemplate[]
  citedUrls: string[]
  entryHost: string
  maxPages: number
  maxDepth: number
  linkGraph?: LinkGraphPayload | null
  crawlStrategy?: string
  sitemapReserveRatio?: number
  externalChecks?: ExternalCheckResult[] | null
  externalCheckProtocol?: { cap: number; checked: number; skippedUrls: number; failedBatches?: number } | null
}): SiteAuditPayload {
  const { templates, citedUrls, entryHost, maxPages, maxDepth } = input
  const view = input.linkGraph ? readLinkGraph({ linkGraph: input.linkGraph }) : null
  // 有图谱时逐页深度取图谱 BFS 深度（修 D1：sitemap 页不再恒为 null）。只写精确值：上界深度与首页不可达
  // 都记 null，避免下游（如 IPF 的深度扣分）把上界当实测（独立审查附带说明）。按 nodeFor 查，跳转请求 URL 取最终节点。
  const pages = view
    ? input.pages.map((p) => {
        const n = view.nodeFor(p.url)
        return { ...p, depth: n?.depthExact ? n.depth : null }
      })
    : input.pages
  const checkedPages = pages.filter((p) => p.checkStatus === 'checked')

  const counts = new Map<string, number>()
  const pageUrlSet = new Set(pages.map((p) => p.url))
  for (const raw of citedUrls) {
    const n = normalizeUrl(raw)
    if (n && pageUrlSet.has(n)) counts.set(n, (counts.get(n) ?? 0) + 1)
  }

  return {
    protocol: {
      maxPages,
      maxDepth,
      ...(input.crawlStrategy ? { crawlStrategy: input.crawlStrategy } : {}),
      ...(input.sitemapReserveRatio !== undefined ? { sitemapReserveRatio: input.sitemapReserveRatio } : {}),
      ...(input.externalCheckProtocol ? { externalCheck: input.externalCheckProtocol } : {}),
    },
    stats: {
      totalDiscovered: pages.length,
      checked: checkedPages.length,
      truncated: pages.filter((p) => p.checkStatus === 'discovered_only').length,
      http4xx: checkedPages.filter((p) => (p.httpStatus ?? 0) >= 400 && (p.httpStatus ?? 0) < 500).length,
      http5xx: checkedPages.filter((p) => (p.httpStatus ?? 0) >= 500).length,
      errors: pages.filter((p) => p.checkStatus === 'error').length,
      blockedByRobots: pages.filter((p) => p.checkStatus === 'blocked_by_robots').length,
      noindex: checkedPages.filter(isNoindex).length,
      canonicalOffsite: checkedPages.filter((p) => isCanonicalOffsite(p, entryHost)).length,
      orphanPages: pages.filter(isOrphan).length,
      citedPages: counts.size,
    },
    pages,
    templates,
    citations: [...counts.entries()].map(([url, count]) => ({ url, count })),
    ...(input.linkGraph ? { linkGraph: input.linkGraph } : {}),
    ...(input.externalChecks ? { externalChecks: input.externalChecks } : {}),
  }
}
