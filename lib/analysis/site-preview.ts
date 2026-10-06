import { assertPublicUrl as realAssertPublicUrl, SsrfBlockedError } from '@/lib/security/ssrf-guard'
import { safeFetch as realSafeFetch, type SafeFetchInit } from '@/lib/security/safe-fetch'
import { decodeBody, readBodyLimited } from '@/lib/crawl/light-check'
import { brandFromDomain } from '@/lib/probes/prompt-set'
import { categoryCandidates, extractSitePreviewFacts, type SitePreviewFacts } from './category-candidates'

// 向导第 1 步的站点预读（SP-A §3.2）：只读、不落库；任何失败都只返回空候选 + error 短码，绝不抛错，
// 向导照常允许手填品类。
export interface SitePreview {
  facts: SitePreviewFacts
  candidates: string[]
  error: string | null
}

const EMPTY_FACTS: SitePreviewFacts = { title: null, h1: null, metaDescription: null, siteName: null }

export interface PreviewDeps {
  assertPublicUrl: (u: string) => Promise<URL>
  safeFetch: (u: string, init?: SafeFetchInit) => Promise<Response>
}

const defaultDeps: PreviewDeps = { assertPublicUrl: realAssertPublicUrl, safeFetch: realSafeFetch }

export async function previewSite(url: string, deps: PreviewDeps = defaultDeps): Promise<SitePreview> {
  const empty = (error: string): SitePreview => ({ facts: EMPTY_FACTS, candidates: [], error })
  let safe: URL
  try {
    safe = await deps.assertPublicUrl(url)
  } catch (err) {
    return empty(err instanceof SsrfBlockedError ? 'blocked' : 'invalid_url')
  }
  try {
    const res = await deps.safeFetch(safe.toString(), { timeoutMs: 8000 })
    if (res.status >= 400) return empty(`http_${res.status}`)
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType && !/html/i.test(contentType)) return empty('not_html')
    const html = decodeBody(await readBodyLimited(res), contentType)
    const facts = extractSitePreviewFacts(html)
    return { facts, candidates: categoryCandidates(facts, brandFromDomain(safe.hostname)), error: null }
  } catch {
    return empty('fetch_failed')
  }
}
