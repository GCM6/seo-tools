import { describe, it, expect, vi } from 'vitest'
import { querySearchAnalytics, listSites, mapRowsToKeywordMetrics, type GscRow } from './search-analytics'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('querySearchAnalytics', () => {
  it('posts to the site-scoped endpoint and normalizes rows', async () => {
    const apiBody = {
      rows: [
        { keys: ['best docs tool'], clicks: 10, impressions: 100, ctr: 0.1, position: 3.2 },
        { keys: ['veris seo'], clicks: 2, impressions: 40, ctr: 0.05, position: 8.0 },
      ],
    }
    const fetchMock = vi.fn(async () => jsonResponse(apiBody))
    const rows = await querySearchAnalytics(
      'at_1',
      'sc-domain:veris.app',
      { startDate: '2026-06-01', endDate: '2026-06-28', dimensions: ['query'], rowLimit: 500 },
      fetchMock,
    )

    const [url, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    expect(url).toBe(
      'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Averis.app/searchAnalytics/query',
    )
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer at_1')
    const sent = JSON.parse(init.body as string)
    expect(sent.dimensions).toEqual(['query'])
    expect(sent.rowLimit).toBe(500)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ keys: ['best docs tool'], clicks: 10, impressions: 100, ctr: 0.1, position: 3.2 })
  })

  it('returns [] when the API returns no rows', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    const rows = await querySearchAnalytics(
      'at_1',
      'https://veris.app/',
      { startDate: '2026-06-01', endDate: '2026-06-28', dimensions: ['page'] },
      fetchMock,
    )
    expect(rows).toEqual([])
  })

  it('throws with status and message on error', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'insufficient permissions' } }, 403))
    await expect(
      querySearchAnalytics('at_1', 's', { startDate: 'a', endDate: 'b', dimensions: ['query'] }, fetchMock),
    ).rejects.toThrow(/403 insufficient permissions/)
  })
})

describe('listSites', () => {
  it('returns verified site urls', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ siteEntry: [{ siteUrl: 'sc-domain:veris.app' }, { siteUrl: 'https://veris.app/' }, {}] }),
    )
    const sites = await listSites('at_1', fetchMock)
    expect(sites).toEqual(['sc-domain:veris.app', 'https://veris.app/'])
  })
})

describe('mapRowsToKeywordMetrics', () => {
  const rows: GscRow[] = [
    { keys: ['best docs tool'], clicks: 10, impressions: 100, ctr: 0.1, position: 3.2 },
    { keys: [], clicks: 0, impressions: 0, ctr: 0, position: 0 }, // 跳过空 keys
  ]

  it('shapes query rows into keyword_metrics-ready objects, stringifying ctr/position', () => {
    const out = mapRowsToKeywordMetrics(rows, 'query')
    expect(out).toEqual([
      {
        keyText: 'best docs tool',
        dimension: 'query',
        source: 'gsc',
        clicks: 10,
        impressions: 100,
        ctr: '0.1',
        position: '3.2',
      },
    ])
  })

  it('carries the page dimension through', () => {
    const out = mapRowsToKeywordMetrics(
      [{ keys: ['https://veris.app/pricing'], clicks: 5, impressions: 50, ctr: 0.1, position: 2 }],
      'page',
    )
    expect(out[0].dimension).toBe('page')
    expect(out[0].keyText).toBe('https://veris.app/pricing')
  })
})
