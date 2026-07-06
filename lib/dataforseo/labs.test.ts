import { describe, it, expect, vi } from 'vitest'
import { createDataforseoClient } from './client'
import { keywordData } from './labs'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
function clientWith(fetchMock: typeof fetch) {
  return createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock })
}

describe('keywordData', () => {
  it('sends keywords array and maps nested overview fields', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                items: [
                  {
                    keyword: 'seo tools',
                    keyword_info: { search_volume: 12000, cpc: 4.2 },
                    keyword_properties: { keyword_difficulty: 65 },
                    search_intent_info: { main_intent: 'commercial' },
                  },
                ],
              },
            ],
          },
        ],
      }),
    )
    const out = await keywordData(clientWith(fetchMock), ['seo tools'], { locationCode: 2840, languageCode: 'en' })

    const [url, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    expect(url).toContain('/v3/dataforseo_labs/google/keyword_overview/live')
    expect(JSON.parse(init.body as string)).toEqual([
      { keywords: ['seo tools'], location_code: 2840, language_code: 'en' },
    ])
    expect(out).toEqual([
      { keyword: 'seo tools', searchVolume: 12000, difficulty: 65, cpc: 4.2, intent: 'commercial' },
    ])
  })

  it('degrades every missing field to null', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ items: [{ keyword: 'bare' }] }] }],
      }),
    )
    const out = await keywordData(clientWith(fetchMock), ['bare'], { locationCode: 1, languageCode: 'en' })
    expect(out).toEqual([{ keyword: 'bare', searchVolume: null, difficulty: null, cpc: null, intent: null }])
  })

  it('drops items without a keyword', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ items: [{ keyword_info: { search_volume: 1 } }] }] }],
      }),
    )
    const out = await keywordData(clientWith(fetchMock), ['x'], { locationCode: 1, languageCode: 'en' })
    expect(out).toEqual([])
  })

  it('returns [] without calling fetch for empty keyword list', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status_code: 20000, tasks: [] }))
    const out = await keywordData(clientWith(fetchMock), [], { locationCode: 1, languageCode: 'en' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out).toEqual([])
  })
})
