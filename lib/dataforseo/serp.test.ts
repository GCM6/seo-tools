import { describe, it, expect, vi } from 'vitest'
import { createDataforseoClient } from './client'
import { seedSerp, bingIndex, brandSerp } from './serp'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
function clientWith(fetchMock: typeof fetch) {
  return createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock })
}

describe('seedSerp', () => {
  it('sends an array task per keyword and maps organic items (www stripped)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            status_message: 'Ok.',
            result: [
              {
                keyword: 'seo tools',
                items: [
                  { type: 'organic', domain: 'www.Ahrefs.com', url: 'https://ahrefs.com/a', rank_absolute: 1, title: 'A' },
                  { type: 'featured_snippet', domain: 'moz.com', url: 'https://moz.com/b', rank_absolute: 2, title: 'B' },
                  { type: 'people_also_ask', title: 'no domain here' }, // 无 domain → 跳过
                ],
              },
            ],
          },
        ],
      }),
    )
    const out = await seedSerp(clientWith(fetchMock), ['seo tools'], { locationCode: 2840, languageCode: 'en', depth: 20 })

    const [url, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    expect(url).toContain('/v3/serp/google/organic/live/advanced')
    expect(JSON.parse(init.body as string)).toEqual([
      { keyword: 'seo tools', location_code: 2840, language_code: 'en', depth: 20 },
    ])
    expect(out).toEqual({
      engine: 'google',
      locationCode: 2840,
      languageCode: 'en',
      results: [
        {
          keyword: 'seo tools',
          items: [
            { domain: 'ahrefs.com', url: 'https://ahrefs.com/a', rank: 1, title: 'A', type: 'organic' },
            { domain: 'moz.com', url: 'https://moz.com/b', rank: 2, title: 'B', type: 'featured_snippet' },
          ],
        },
      ],
    })
  })

  it('defaults depth to 10 when omitted', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status_code: 20000, tasks: [] }))
    await seedSerp(clientWith(fetchMock), ['x'], { locationCode: 1, languageCode: 'en' })
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    expect(JSON.parse(init.body as string)[0].depth).toBe(10)
  })

  it('returns empty results for empty keyword list without calling fetch', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status_code: 20000, tasks: [] }))
    const out = await seedSerp(clientWith(fetchMock), [], { locationCode: 1, languageCode: 'en' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.results).toEqual([])
  })
})

describe('bingIndex', () => {
  it('queries site:<domain> and reads se_results_count + item count', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ se_results_count: 1240, items: [{}, {}, {}] }] }],
      }),
    )
    const out = await bingIndex(clientWith(fetchMock), 'www.Example.com', { locationCode: 2840, languageCode: 'en' })

    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    expect(JSON.parse(init.body as string)[0].keyword).toBe('site:example.com')
    expect(out).toEqual({ engine: 'bing', domain: 'example.com', totalCount: 1240, itemCount: 3 })
  })

  it('degrades totalCount to null when field missing', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] }),
    )
    const out = await bingIndex(clientWith(fetchMock), 'example.com', { locationCode: 1, languageCode: 'en' })
    expect(out.totalCount).toBeNull()
    expect(out.itemCount).toBe(0)
  })
})

describe('brandSerp', () => {
  it('detects knowledge_graph and own-domain presence', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                keyword: 'veris',
                items: [
                  { type: 'knowledge_graph', title: 'Veris panel' }, // 无 domain 也算命中
                  { type: 'organic', domain: 'www.veris.app', url: 'https://veris.app', rank_absolute: 1 },
                  { type: 'organic', domain: 'wikipedia.org', url: 'https://wikipedia.org/veris', rank_absolute: 2 },
                ],
              },
            ],
          },
        ],
      }),
    )
    const out = await brandSerp(clientWith(fetchMock), 'veris', 'veris.app', { locationCode: 2840, languageCode: 'en' })
    expect(out).toEqual({
      engine: 'google',
      brandQuery: 'veris',
      hasKnowledgePanel: true,
      ownDomainPresent: true,
      items: [
        { domain: 'veris.app', url: 'https://veris.app', rank: 1 },
        { domain: 'wikipedia.org', url: 'https://wikipedia.org/veris', rank: 2 },
      ],
    })
  })

  it('reports no knowledge panel and absent own domain', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                keyword: 'veris',
                items: [{ type: 'organic', domain: 'other.com', url: 'https://other.com', rank_absolute: 1 }],
              },
            ],
          },
        ],
      }),
    )
    const out = await brandSerp(clientWith(fetchMock), 'veris', 'veris.app', { locationCode: 1, languageCode: 'en' })
    expect(out.hasKnowledgePanel).toBe(false)
    expect(out.ownDomainPresent).toBe(false)
  })

  it('throws when the underlying task errors', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status_code: 20000, tasks: [{ status_code: 40000, status_message: 'boom' }] }),
    )
    await expect(
      brandSerp(clientWith(fetchMock), 'veris', 'veris.app', { locationCode: 1, languageCode: 'en' }),
    ).rejects.toThrow(/task error 40000/)
  })
})
