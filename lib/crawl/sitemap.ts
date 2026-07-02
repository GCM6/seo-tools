import { safeFetch } from '@/lib/security/safe-fetch'
import { normalizeUrl } from './url'

export interface SitemapFile { url: string; xml: string }
export interface SitemapDiscovery { files: SitemapFile[]; pageUrls: string[]; warnings: string[] }

// 防爆闸门：sitemap 文件数与 URL 总数上限（超出记 warning，不算错误）。
const MAX_SITEMAP_FILES = 10
const MAX_PAGE_URLS = 5000

export function sitemapUrlsFromRobots(robotsTxt: string): string[] {
  return robotsTxt
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^sitemap\s*:/i.test(l))
    .map((l) => l.replace(/^sitemap\s*:/i, '').trim())
    .filter(Boolean)
}

// XML 里只取 <loc>，容忍 CDATA。sitemap 的 loc 不嵌套，正则解析足够且免依赖。
export function extractLocs(xml: string): { isIndex: boolean; locs: string[] } {
  const isIndex = /<\s*sitemapindex[\s>]/i.test(xml)
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].trim())
  return { isIndex, locs }
}

export async function discoverSitemaps(
  entryUrl: string,
  robotsTxt: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<SitemapDiscovery> {
  const origin = new URL(entryUrl).origin
  const declared = sitemapUrlsFromRobots(robotsTxt)
  const fallback = `${origin}/sitemap.xml`
  const queue = declared.length ? [...declared] : [fallback]
  const seen = new Set<string>()
  const files: SitemapFile[] = []
  const pageUrls = new Set<string>()
  const warnings: string[] = []

  while (queue.length && files.length < MAX_SITEMAP_FILES && pageUrls.size < MAX_PAGE_URLS) {
    const url = queue.shift()!
    if (seen.has(url)) continue
    seen.add(url)
    let res: Response
    try {
      res = await fetchImpl(url)
    } catch {
      warnings.push(`sitemap_fetch_failed:${url}`)
      continue
    }
    if (res.status !== 200) {
      // 回退地址 404 是常态，不记 warning；声明过的地址失败要记。
      if (declared.length || url !== fallback) warnings.push(`sitemap_http_${res.status}:${url}`)
      continue
    }
    const xml = await res.text()
    files.push({ url, xml })
    const { isIndex, locs } = extractLocs(xml)
    if (isIndex) {
      queue.push(...locs)
    } else {
      for (const loc of locs) {
        const n = normalizeUrl(loc)
        if (n) pageUrls.add(n)
        if (pageUrls.size >= MAX_PAGE_URLS) break
      }
    }
  }
  if (queue.length) warnings.push(`sitemap_truncated:${queue.length}_files_unread`)
  return { files, pageUrls: [...pageUrls], warnings }
}
