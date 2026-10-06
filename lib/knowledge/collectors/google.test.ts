import { describe, expect, it, vi } from 'vitest'
import { collectGoogleFeed } from './google'

describe('Google knowledge collector', () => {
  it('follows feed entries and stores readable article text', async () => {
    const feed = `<?xml version="1.0"?><rss><channel><item><title>Docs changed</title><link>https://developers.google.com/search/docs/change</link><guid>doc-1</guid><pubDate>Fri, 08 Aug 2026 00:00:00 GMT</pubDate></item></channel></rss>`
    const html = '<html lang="en"><head><title>Fallback</title></head><body><nav>Skip</nav><main><h1>Canonical update</h1><p>Google changed the documented behavior.</p></main></body></html>'
    const fetchMock = vi.fn(async (url: string | URL | Request) => String(url).endsWith('.rss')
      ? new Response(feed, { status: 200 })
      : new Response(html, { status: 200, headers: { etag: 'v1' } }))
    const rows = await collectGoogleFeed('https://example.test/updates.rss', { fetchImpl: fetchMock as typeof fetch })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ externalId: 'doc-1', title: 'Canonical update', etag: 'v1' })
    expect(rows[0].rawText).toContain('Google changed the documented behavior.')
  })
})

