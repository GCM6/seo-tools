import { describe, it, expect, vi } from 'vitest'
import { createDataforseoClient } from './client'
import { backlinksSummary } from './backlinks'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
function clientWith(fetchMock: typeof fetch) {
  return createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock })
}

describe('backlinksSummary', () => {
  it('posts live status body and maps core metrics', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [{ referring_domains: 320, backlinks: 5400, rank: 480 }],
          },
        ],
      }),
    )
    const out = await backlinksSummary(clientWith(fetchMock), 'example.com')

    const [url, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    expect(url).toContain('/v3/backlinks/summary/live')
    expect(JSON.parse(init.body as string)).toEqual([
      { target: 'example.com', internal_list_limit: 10, backlinks_status_type: 'live' },
    ])
    expect(out).toEqual({
      target: 'example.com',
      referringDomains: 320,
      backlinks: 5400,
      rank: 480,
      anchors: [],
      newLost: null,
    })
  })

  it('maps anchors when present and defaults dofollow', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                referring_domains: 10,
                backlinks: 20,
                rank: 100,
                anchors: [
                  { anchor: 'example', backlinks: 12, dofollow: 12 },
                  { anchor: 'click here', count: 3, dofollow: 0 },
                  { backlinks: 5 }, // 无 anchor → 跳过
                ],
              },
            ],
          },
        ],
      }),
    )
    const out = await backlinksSummary(clientWith(fetchMock), 'example.com')
    expect(out.anchors).toEqual([
      { anchor: 'example', count: 12, dofollow: true },
      { anchor: 'click here', count: 3, dofollow: false },
    ])
  })

  it('degrades missing metrics (rank null, counts 0, anchors [])', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status_code: 20000, tasks: [{ status_code: 20000, result: [{}] }] }),
    )
    const out = await backlinksSummary(clientWith(fetchMock), 'example.com')
    expect(out).toEqual({
      target: 'example.com',
      referringDomains: 0,
      backlinks: 0,
      rank: null,
      anchors: [],
      newLost: null,
    })
  })
})
