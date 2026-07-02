import { parseHTML } from 'linkedom'
import { safeFetch } from '@/lib/security/safe-fetch'
import { extractMainTextChars } from '@/lib/collection/page-parser'
import { sha256Hex } from '@/lib/collection/hash'
import { normalizeUrl, isSameSite } from './url'

export interface LightCheckPage {
  url: string
  finalUrl: string
  httpStatus: number
  title: string | null
  canonicalUrl: string | null
  metaRobots: string | null
  mainTextChars: number
  contentHash: string
  internalLinks: string[]
  checkStatus: 'checked' | 'error'
  errorReason: string | null
}

export function parseLightCheckHtml(html: string, pageUrl: string, entryHost: string) {
  const { document } = parseHTML(html)
  const title = document.querySelector('title')?.textContent?.trim() || null
  const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
  const metaRobots = document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null
  const internalLinks = new Set<string>()
  for (const a of document.querySelectorAll('a[href]')) {
    const n = normalizeUrl(a.getAttribute('href') ?? '', pageUrl)
    if (n && isSameSite(n, entryHost) && n !== pageUrl) internalLinks.add(n)
  }
  return { title, canonicalUrl, metaRobots, mainTextChars: extractMainTextChars(html), internalLinks: [...internalLinks] }
}

const EMPTY_PARSE = { title: null, canonicalUrl: null, metaRobots: null, mainTextChars: 0, internalLinks: [] as string[] }

// 单页轻检永不抛错：失败收敛为 checkStatus='error'，run 不因单页中断。
export async function fetchLightCheck(
  url: string,
  entryHost: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<LightCheckPage> {
  try {
    const res = await fetchImpl(url, { timeoutMs: 10_000 })
    const finalUrl = normalizeUrl(res.url || url) ?? url
    const contentType = res.headers.get('content-type') ?? ''
    if (res.status >= 400 || !contentType.includes('text/html')) {
      return { url, finalUrl, httpStatus: res.status, ...EMPTY_PARSE, contentHash: '', checkStatus: 'checked', errorReason: null }
    }
    const html = await res.text()
    return {
      url,
      finalUrl,
      httpStatus: res.status,
      ...parseLightCheckHtml(html, finalUrl, entryHost),
      contentHash: sha256Hex(html),
      checkStatus: 'checked',
      errorReason: null,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'fetch_failed'
    return { url, finalUrl: url, httpStatus: 0, ...EMPTY_PARSE, contentHash: '', checkStatus: 'error', errorReason: reason }
  }
}
