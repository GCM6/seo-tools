import { parseHTML } from 'linkedom'
import { safeFetch } from '@/lib/security/safe-fetch'

export interface PageFacts {
  rawHtml: string
  mainTextChars: number
  canonicalUrl: string | null
  metaRobots: string | null
}

export function extractMainTextChars(html: string): number {
  const { document } = parseHTML(html)
  document.querySelectorAll('script, style').forEach((el) => el.remove())
  return (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim().length
}

export function parsePageFacts(html: string): Omit<PageFacts, 'rawHtml'> {
  const { document } = parseHTML(html)
  const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
  const metaRobots = document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null
  return { mainTextChars: extractMainTextChars(html), canonicalUrl, metaRobots }
}

export async function fetchPageFacts(
  url: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<PageFacts> {
  const res = await fetchImpl(url)
  const rawHtml = await res.text()
  return { rawHtml, ...parsePageFacts(rawHtml) }
}
