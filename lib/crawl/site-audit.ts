import { normalizeUrl, isSameSite } from './url'
import type { LightCheckExtra } from './light-check'

// site_audit：一次 run 的全站轻检不可变快照（存 evidence payload）。
// site_pages 表是「当前状态」，本快照才是 findings 引用与 retest 对比的锚。

export interface SiteAuditPage {
  url: string
  discoveredVia: string
  depth: number | null
  httpStatus: number | null
  finalUrl: string | null
  canonicalUrl: string | null
  metaRobots: string | null
  mainTextChars: number | null
  inboundLinkCount: number
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
  protocol: { maxPages: number; maxDepth: number }
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
}): SiteAuditPayload {
  const { pages, templates, citedUrls, entryHost, maxPages, maxDepth } = input
  const checkedPages = pages.filter((p) => p.checkStatus === 'checked')

  const counts = new Map<string, number>()
  const pageUrlSet = new Set(pages.map((p) => p.url))
  for (const raw of citedUrls) {
    const n = normalizeUrl(raw)
    if (n && pageUrlSet.has(n)) counts.set(n, (counts.get(n) ?? 0) + 1)
  }

  return {
    protocol: { maxPages, maxDepth },
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
  }
}
