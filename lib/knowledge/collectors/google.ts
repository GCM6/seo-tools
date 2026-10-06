import { parseHTML } from 'linkedom'
import type { SourceCandidate } from '../types'
import { fetchWithRetry } from '../fetch'

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))
  return match ? decodeXml(match[1]).trim() : ''
}

function atomLink(block: string): string {
  return block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? tag(block, 'link')
}

function articleText(html: string): { title: string; text: string; locale: string } {
  const { document } = parseHTML(html)
  for (const selector of ['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript']) {
    document.querySelectorAll(selector).forEach((node) => node.remove())
  }
  const root = document.querySelector('main, article') ?? document.body
  return {
    title: document.querySelector('h1')?.textContent?.trim() || document.title || '',
    text: (root?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    locale: document.documentElement.lang || 'en',
  }
}

export async function collectGoogleFeed(
  feedUrl: string,
  options: { since?: Date; fetchImpl?: typeof fetch } = {},
): Promise<SourceCandidate[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const feedResponse = await fetchWithRetry(feedUrl, { headers: { accept: 'application/rss+xml, application/atom+xml, text/xml' } }, { fetchImpl })
  if (!feedResponse.ok) throw new Error(`google_feed_failed:${feedResponse.status}`)
  const xml = await feedResponse.text()
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2])
  const candidates: SourceCandidate[] = []
  for (const block of blocks) {
    const link = atomLink(block)
    if (!link) continue
    const publishedRaw = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated')
    const publishedAt = publishedRaw ? new Date(publishedRaw).toISOString() : undefined
    if (options.since && publishedAt && new Date(publishedAt) < options.since) continue
    const page = await fetchWithRetry(link, { headers: { accept: 'text/html', 'accept-language': 'en' } }, { fetchImpl })
    if (!page.ok) throw new Error(`google_document_failed:${page.status}:${link}`)
    const parsed = articleText(await page.text())
    let localized: { url: string; title: string; text: string; locale: string } | undefined
    try {
      const localizedUrl = new URL(link)
      localizedUrl.searchParams.set('hl', 'zh-cn')
      const localizedResponse = await fetchWithRetry(localizedUrl.toString(), { headers: { accept: 'text/html', 'accept-language': 'zh-CN,zh;q=0.9' } }, { fetchImpl, retries: 1 })
      if (localizedResponse.ok) {
        const zh = articleText(await localizedResponse.text())
        if (zh.text && zh.text !== parsed.text) localized = { url: localizedUrl.toString(), ...zh }
      }
    } catch {
      // 中文副本是辅助存档；英文规范页仍是官方真源，副本失败不阻断采集。
    }
    const guid = tag(block, 'guid') || tag(block, 'id') || link
    candidates.push({
      externalId: guid,
      canonicalUrl: link,
      documentType: /update|changelog/i.test(feedUrl) ? 'release_note' : 'article',
      title: parsed.title || tag(block, 'title'),
      publishedAt,
      locale: parsed.locale,
      rawText: parsed.text || tag(block, 'description') || tag(block, 'summary'),
      rawPayload: { feedEntry: block, fetchedUrl: link, localized },
      metadata: { feedUrl, localizedUrl: localized?.url, localizedLocale: localized?.locale },
      etag: page.headers.get('etag') ?? undefined,
      lastModified: page.headers.get('last-modified') ?? undefined,
    })
  }
  return candidates
}
