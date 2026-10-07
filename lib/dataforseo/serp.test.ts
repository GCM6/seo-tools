import { describe, it, expect, vi } from 'vitest'
import { createDataforseoClient } from './client'
import { seedSerp, bingIndex, brandSerp } from './serp'
import { reasonOf } from '@/lib/collection/result'

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
            { domain: 'ahrefs.com', url: 'https://ahrefs.com/a', rank: 1, rankGroup: null, title: 'A', type: 'organic' },
            { domain: 'moz.com', url: 'https://moz.com/b', rank: 2, rankGroup: null, title: 'B', type: 'featured_snippet' },
          ],
        },
      ],
    })
  })

  it('defaults depth to 10 when omitted', async () => {
    // 真实形状：提交 1 个任务就回 1 个任务（空 tasks 现在按 no_tasks 失败处理）。
    const fetchMock = vi.fn(async () => jsonResponse({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ keyword: 'x', items: [] }] }] }))
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
        { domain: 'veris.app', url: 'https://veris.app', rank: 1, rankGroup: null, type: 'organic' },
        { domain: 'wikipedia.org', url: 'https://wikipedia.org/veris', rank: 2, rankGroup: null, type: 'organic' },
      ],
    })
  })

  it('官网只以广告出现在品牌词 SERP → ownDomainPresent 为 false（广告不是自然排名；验收新发现 3）', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ keyword: 'veris', items: [
          { type: 'paid', domain: 'veris.app', url: 'https://veris.app/lp', rank_group: 1, rank_absolute: 1 },
          { type: 'organic', domain: 'other.com', url: 'https://other.com', rank_group: 1, rank_absolute: 2 },
        ] }] }],
      }),
    )
    const out = await brandSerp(clientWith(fetchMock), 'veris', 'veris.app', { locationCode: 2840, languageCode: 'en' })
    expect(out.ownDomainPresent).toBe(false)
    expect(out.items[0]).toMatchObject({ domain: 'veris.app', type: 'paid', rankGroup: 1 })
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

// 与真实 live 接口同口径的假服务端：一次请求多于 1 个任务时，每个任务都回 40000（2026-10-03 端到端实测）。
function liveApi(handle: (task: { keyword: string }) => unknown | Promise<unknown>) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { keyword: string }[]
    if (body.length > 1) {
      return jsonResponse({ status_code: 20000, tasks: body.map(() => ({ status_code: 40000, status_message: 'You can set only one task at a time.' })) })
    }
    return jsonResponse({ status_code: 20000, tasks: [await handle(body[0])] })
  })
}
const okTask = (keyword: string) => ({ status_code: 20000, status_message: 'Ok.', result: [{ keyword, items: [{ type: 'organic', domain: `${keyword}.com`, url: `https://${keyword}.com/`, rank_absolute: 1, title: keyword }] }] })

describe('seedSerp：live 接口一次只收 1 个任务（2026-10-03 端到端实测 40000）', () => {
  it('多个关键词逐词各发一个请求，结果按关键词顺序返回', async () => {
    const fetchMock = liveApi((t) => okTask(t.keyword))
    const out = await seedSerp(clientWith(fetchMock as unknown as typeof fetch), ['a', 'b', 'c'], { locationCode: 1, languageCode: 'en' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const call of fetchMock.mock.calls) expect(JSON.parse((call[1] as RequestInit).body as string)).toHaveLength(1)
    expect(out.results.map((r) => r.keyword)).toEqual(['a', 'b', 'c'])
    expect(out.failedKeywords).toBeUndefined()
  })

  it('并发不超过 5', async () => {
    let inFlight = 0
    let peak = 0
    const fetchMock = liveApi(async (t) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return okTask(t.keyword)
    })
    const kws = Array.from({ length: 12 }, (_, i) => `k${i}`)
    const out = await seedSerp(clientWith(fetchMock as unknown as typeof fetch), kws, { locationCode: 1, languageCode: 'en' })
    expect([out.results.length, peak <= 5, peak > 1]).toEqual([12, true, true])
  })

  it('单个词的任务级错误只记入 failedKeywords，其余照常返回', async () => {
    const fetchMock = liveApi((t) => (t.keyword === 'bad' ? { status_code: 40501, status_message: 'Invalid Field.' } : okTask(t.keyword)))
    const out = await seedSerp(clientWith(fetchMock as unknown as typeof fetch), ['a', 'bad', 'c'], { locationCode: 1, languageCode: 'en' })
    expect(out.results.map((r) => r.keyword)).toEqual(['a', 'c'])
    expect(out.failedKeywords).toEqual([{ keyword: 'bad', error: 'dataforseo task error 40501: Invalid Field.', statusCode: 40501 }])
  })

  it('鉴权/额度等请求级错误立即中止并抛出，不再发剩余请求', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 401 }))
    const kws = Array.from({ length: 20 }, (_, i) => `k${i}`)
    await expect(seedSerp(clientWith(fetchMock as unknown as typeof fetch), kws, { locationCode: 1, languageCode: 'en' })).rejects.toThrow('dataforseo request failed: 401')
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(5)
  })
})

describe('40102「No Search Results」是有效的空结果，不是失败', () => {
  it('seedSerp：该词记为 items 为空的结果', async () => {
    const fetchMock = liveApi((t) => (t.keyword === 'rare' ? { status_code: 40102, status_message: 'No Search Results.' } : okTask(t.keyword)))
    const out = await seedSerp(clientWith(fetchMock as unknown as typeof fetch), ['a', 'rare'], { locationCode: 1, languageCode: 'en' })
    expect(out.results).toEqual([{ keyword: 'a', items: expect.any(Array) }, { keyword: 'rare', items: [] }])
    expect(out.failedKeywords).toBeUndefined()
  })
})

describe('bingIndex / brandSerp：40102 记为零结果（2026-10-03 端到端：site:metadocu.com 在 Bing 无结果被当成异常，G04 拿不到证据）', () => {
  const noResults = () => vi.fn(async () => jsonResponse({ status_code: 20000, tasks: [{ status_code: 40102, status_message: 'No Search Results.' }] }))
  it('bingIndex → 收录 0', async () => {
    const out = await bingIndex(clientWith(noResults() as unknown as typeof fetch), 'www.Example.com', { locationCode: 1, languageCode: 'en' })
    expect(out).toEqual({ engine: 'bing', domain: 'example.com', totalCount: 0, itemCount: 0 })
  })
  it('brandSerp → 无知识面板、官网不在结果中', async () => {
    const out = await brandSerp(clientWith(noResults() as unknown as typeof fetch), 'example', 'example.com', { locationCode: 1, languageCode: 'en' })
    expect(out).toMatchObject({ hasKnowledgePanel: false, ownDomainPresent: false, items: [] })
  })
  it('其他任务级错误照常抛出', async () => {
    const bad = vi.fn(async () => jsonResponse({ status_code: 20000, tasks: [{ status_code: 40501, status_message: 'Invalid Field.' }] }))
    await expect(bingIndex(clientWith(bad as unknown as typeof fetch), 'example.com', { locationCode: 1, languageCode: 'en' })).rejects.toThrow('40501')
  })
})

describe('seedSerp 失败词带任务状态码（SP-A §4.2：子阶段原因 task_<code>）', () => {
  it('任务级错误的种子词记入 failedKeywords，带 statusCode；40102 零结果仍记为空结果', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const keyword = (JSON.parse(String(init?.body)) as { keyword: string }[])[0].keyword
      const task = keyword === 'bad'
        ? { status_code: 40101, status_message: 'Internal SE Server Error.' }
        : keyword === 'zero'
          ? { status_code: 40102, status_message: 'No Search Results.' }
          : { status_code: 20000, status_message: 'Ok.', result: [{ keyword, items: [] }] }
      return new Response(JSON.stringify({ status_code: 20000, tasks: [task] }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })
    const r = await seedSerp(client, ['good', 'bad', 'zero'], { locationCode: 2840, languageCode: 'en' })
    expect(r.results.map((e) => e.keyword)).toEqual(['good', 'zero'])
    expect(r.failedKeywords).toEqual([{ keyword: 'bad', error: 'dataforseo task error 40101: Internal SE Server Error.', statusCode: 40101 }])
  })
})

describe('任务成功但没有 result（第二波审查 C1）', () => {
  const okNoResult = () => new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, status_message: 'Ok.', result: null }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  const client = () => createDataforseoClient({ login: 'u', password: 'p', fetchImpl: vi.fn(async () => okNoResult()) as unknown as typeof fetch })
  it('bingIndex / brandSerp → 抛错 empty_result（不是"Bing 0 收录""无知识面板"）', async () => {
    expect(reasonOf(await bingIndex(client(), 'example.com', { locationCode: 2840, languageCode: 'en' }).catch((e: unknown) => e))).toBe('empty_result')
    expect(reasonOf(await brandSerp(client(), 'example', 'example.com', { locationCode: 2840, languageCode: 'en' }).catch((e: unknown) => e))).toBe('empty_result')
  })
  it('seedSerp → 该词记入 failedKeywords（error 为 empty_result），不再静默丢掉', async () => {
    const r = await seedSerp(client(), ['remove exif'], { locationCode: 2840, languageCode: 'en' })
    expect(r.results).toEqual([])
    expect(r.failedKeywords).toEqual([{ keyword: 'remove exif', error: 'empty_result' }])
  })
})

describe('任务成功、JSON 合法但缺 items（最终审查 F1-1：缺字段不能当测得的 0）', () => {
  const clientReturning = (result: unknown) =>
    createDataforseoClient({
      login: 'u',
      password: 'p',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, status_message: 'Ok.', result }] }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch,
    })
  const loc = { locationCode: 2840, languageCode: 'en' }
  it('bingIndex：result 为 [{}] 或 items:null → 抛错 invalid_shape（不是"Bing 0 收录"）', async () => {
    expect(reasonOf(await bingIndex(clientReturning([{}]), 'example.com', loc).catch((e: unknown) => e))).toBe('invalid_shape')
    expect(reasonOf(await bingIndex(clientReturning([{ items: null, se_results_count: null }]), 'example.com', loc).catch((e: unknown) => e))).toBe('invalid_shape')
  })
  it('bingIndex：items 是空数组（合法的零条）→ 照常返回 0', async () => {
    expect(await bingIndex(clientReturning([{ items: [], se_results_count: 0 }]), 'example.com', loc)).toMatchObject({ totalCount: 0, itemCount: 0 })
  })
  it('brandSerp：result 为 [{}] → 抛错 invalid_shape（不是"官网不在品牌词首页 / 无知识面板"）', async () => {
    expect(reasonOf(await brandSerp(clientReturning([{}]), 'example', 'example.com', loc).catch((e: unknown) => e))).toBe('invalid_shape')
  })
})

describe('seedSerp 保存 rank_group（官方示例，验收新发现 3）', () => {
  it('自然结果 rank_group 26 / rank_absolute 30；广告 rank_group 1 且 type 为 paid', async () => {
    const { DFS_SERP_GOOGLE_ORGANIC_LIVE_ADVANCED_DOC } = await import('@/lib/test-fixtures/real-shapes')
    const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: vi.fn(async () => new Response(DFS_SERP_GOOGLE_ORGANIC_LIVE_ADVANCED_DOC, { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch })
    const out = await seedSerp(client, ['flight ticket new york san francisco'], { locationCode: 2840, languageCode: 'en' })
    const items = out.results[0].items
    expect(items.find((i) => i.type === 'organic')).toMatchObject({ domain: 't-mobile.com', rank: 30, rankGroup: 26 })
    expect(items.find((i) => i.type === 'paid')).toMatchObject({ rank: 1, rankGroup: 1 })
  })
})
