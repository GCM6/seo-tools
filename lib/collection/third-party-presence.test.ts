import { describe, it, expect, vi } from 'vitest'
import { checkThirdPartyPresence } from './third-party-presence'

// 按 URL 路由到 Wikipedia / Reddit 的 mock fetch。
function makeFetch(opts: {
  wiki?: { status: number; json: unknown } | 'throw'
  reddit?: { status: number; json: unknown } | 'throw'
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const target = url.includes('wikipedia.org') ? opts.wiki : opts.reddit
    if (target === 'throw') throw new Error('rate limited')
    if (!target) return new Response('{}', { status: 200 })
    return new Response(JSON.stringify(target.json), { status: target.status })
  })
}

// 生成 n 条 Reddit 帖子，created_utc 距今 ageDays 天。
function redditPosts(n: number, ageDays: number) {
  const created = Date.now() / 1000 - ageDays * 24 * 60 * 60
  return {
    data: { children: Array.from({ length: n }, () => ({ data: { created_utc: created } })) },
  }
}

describe('checkThirdPartyPresence — Wikipedia', () => {
  it('命中 → exists:true，取 title 并构造条目 URL', async () => {
    const fetchImpl = makeFetch({
      wiki: { status: 200, json: { query: { search: [{ title: 'Acme Corp' }] } } },
      reddit: { status: 200, json: redditPosts(0, 1) },
    })
    const result = await checkThirdPartyPresence({ brand: 'Acme' }, fetchImpl)
    expect(result.wikipedia.exists).toBe(true)
    expect(result.wikipedia.title).toBe('Acme Corp')
    expect(result.wikipedia.url).toBe('https://en.wikipedia.org/wiki/Acme_Corp')
  })

  it('无结果 → exists:false, title/url 为 null', async () => {
    const fetchImpl = makeFetch({
      wiki: { status: 200, json: { query: { search: [] } } },
      reddit: { status: 200, json: redditPosts(0, 1) },
    })
    const result = await checkThirdPartyPresence({ brand: 'NoSuchBrandXYZ' }, fetchImpl)
    expect(result.wikipedia).toEqual({ exists: false, title: null, url: null })
  })

  it('请求抛错 → 降级为 exists:false，不抛出', async () => {
    const fetchImpl = makeFetch({ wiki: 'throw', reddit: { status: 200, json: redditPosts(0, 1) } })
    const result = await checkThirdPartyPresence({ brand: 'Acme' }, fetchImpl)
    expect(result.wikipedia.exists).toBe(false)
  })

  it('非 2xx → 降级为 exists:false', async () => {
    const fetchImpl = makeFetch({
      wiki: { status: 500, json: {} },
      reddit: { status: 200, json: redditPosts(0, 1) },
    })
    const result = await checkThirdPartyPresence({ brand: 'Acme' }, fetchImpl)
    expect(result.wikipedia.exists).toBe(false)
  })
})

describe('checkThirdPartyPresence — Reddit', () => {
  it('统计窗口内的帖子数', async () => {
    const fetchImpl = makeFetch({
      wiki: { status: 200, json: { query: { search: [] } } },
      reddit: { status: 200, json: redditPosts(7, 30) }, // 7 条，30 天前，落在默认 365 天窗口内
    })
    const result = await checkThirdPartyPresence({ brand: 'Acme' }, fetchImpl)
    expect(result.reddit.mentions).toBe(7)
    expect(result.reddit.windowDays).toBe(365)
  })

  it('超出窗口的帖子被过滤', async () => {
    const fetchImpl = makeFetch({
      wiki: { status: 200, json: { query: { search: [] } } },
      reddit: { status: 200, json: redditPosts(5, 100) }, // 100 天前
    })
    const result = await checkThirdPartyPresence({ brand: 'Acme', windowDays: 30 }, fetchImpl)
    expect(result.reddit.mentions).toBe(0)
    expect(result.reddit.windowDays).toBe(30)
  })

  it('被限流/抛错 → mentions:0，不抛出', async () => {
    const fetchImpl = makeFetch({ wiki: { status: 200, json: { query: { search: [] } } }, reddit: 'throw' })
    const result = await checkThirdPartyPresence({ brand: 'Acme' }, fetchImpl)
    expect(result.reddit.mentions).toBe(0)
  })

  it('非 2xx → mentions:0', async () => {
    const fetchImpl = makeFetch({
      wiki: { status: 200, json: { query: { search: [] } } },
      reddit: { status: 429, json: {} },
    })
    const result = await checkThirdPartyPresence({ brand: 'Acme' }, fetchImpl)
    expect(result.reddit.mentions).toBe(0)
  })

  it('缺少 created_utc 的帖子按窗口内计入（服务端已 t=year 粗过滤）', async () => {
    const fetchImpl = makeFetch({
      wiki: { status: 200, json: { query: { search: [] } } },
      reddit: { status: 200, json: { data: { children: [{ data: {} }, { data: {} }] } } },
    })
    const result = await checkThirdPartyPresence({ brand: 'Acme' }, fetchImpl)
    expect(result.reddit.mentions).toBe(2)
  })
})
