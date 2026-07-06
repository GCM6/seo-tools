import { describe, it, expect, vi } from 'vitest'
import {
  collectUaProbe,
  SEARCH_CRAWLER_UAS,
  TRAINING_CRAWLER_UAS,
} from './ua-probe'

// 从 init 中安全取出 User-Agent 头（大小写/HeadersInit 两种形态都兼容）。
function readUa(init?: RequestInit): string {
  const h = init?.headers
  if (!h) return ''
  if (h instanceof Headers) return h.get('User-Agent') ?? ''
  if (Array.isArray(h)) return h.find(([k]) => k.toLowerCase() === 'user-agent')?.[1] ?? ''
  return (h as Record<string, string>)['User-Agent'] ?? ''
}

const TOTAL_UAS = SEARCH_CRAWLER_UAS.length + TRAINING_CRAWLER_UAS.length // 8

// 构造一个按 (url, ua) 路由到指定 status 的 mock fetch；llms.txt 返回可配置文本。
function makeFetch(opts: {
  statusFor?: (url: string, ua: string) => number
  llmsTxt?: { status: number; body: string }
  throwOn?: (url: string, ua: string) => boolean
}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const ua = readUa(init)
    if (url.endsWith('/llms.txt')) {
      const l = opts.llmsTxt ?? { status: 404, body: '' }
      return new Response(l.body, { status: l.status })
    }
    if (opts.throwOn?.(url, ua)) throw new Error('network down')
    const status = opts.statusFor?.(url, ua) ?? 200
    return new Response('ok', { status })
  })
}

describe('collectUaProbe — G02 爬虫可达性', () => {
  it('对每个 UA 映射 kind 并按注册表全量探测', async () => {
    const fetchImpl = makeFetch({ statusFor: () => 200 })
    const result = await collectUaProbe({ entryUrl: 'https://example.com/' }, fetchImpl)

    expect(result.crawlers).toHaveLength(TOTAL_UAS)
    const search = result.crawlers.filter((c) => c.kind === 'search').map((c) => c.ua)
    const training = result.crawlers.filter((c) => c.kind === 'training').map((c) => c.ua)
    expect(search).toEqual([...SEARCH_CRAWLER_UAS])
    expect(training).toEqual([...TRAINING_CRAWLER_UAS])
    // 每次请求确实带上了对应 UA 头。
    for (const c of result.crawlers) expect(c.status).toBe(200)
  })

  it('实际发送对应的 User-Agent 头', async () => {
    const seenUas: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (!url.endsWith('/llms.txt')) seenUas.push(readUa(init))
      return new Response('ok', { status: 200 })
    })
    await collectUaProbe({ entryUrl: 'https://example.com/' }, fetchImpl)
    expect(seenUas).toEqual([...SEARCH_CRAWLER_UAS, ...TRAINING_CRAWLER_UAS])
  })

  it('403/429/其它 4xx+ 判为 blocked，2xx/3xx 不封禁', async () => {
    const fetchImpl = makeFetch({
      statusFor: (_url, ua) => {
        if (ua === 'GPTBot') return 403
        if (ua === 'CCBot') return 429
        if (ua === 'Bytespider') return 500
        if (ua === 'OAI-SearchBot') return 301
        return 200
      },
    })
    const result = await collectUaProbe({ entryUrl: 'https://example.com/' }, fetchImpl)
    const byUa = Object.fromEntries(result.crawlers.map((c) => [c.ua, c]))
    expect(byUa['GPTBot'].blocked).toBe(true)
    expect(byUa['CCBot'].blocked).toBe(true)
    expect(byUa['Bytespider'].blocked).toBe(true) // 500 也算封禁（>=400）
    expect(byUa['OAI-SearchBot'].blocked).toBe(false) // 301 不算
    expect(byUa['PerplexityBot'].blocked).toBe(false) // 200
  })

  it('单次请求失败 → status=null 且不判为封禁', async () => {
    const fetchImpl = makeFetch({ throwOn: (_url, ua) => ua === 'ClaudeBot' })
    const result = await collectUaProbe({ entryUrl: 'https://example.com/' }, fetchImpl)
    const claude = result.crawlers.find((c) => c.ua === 'ClaudeBot')!
    expect(claude.status).toBeNull()
    expect(claude.blocked).toBe(false)
  })

  it('多 URL 去重并限制在上限内', async () => {
    const fetchImpl = makeFetch({ statusFor: () => 200 })
    const result = await collectUaProbe(
      {
        entryUrl: 'https://example.com/',
        extraUrls: [
          'https://example.com/', // 与 entryUrl 重复
          'https://example.com/a',
          'https://example.com/b',
          'https://example.com/c',
          'https://example.com/d',
          'https://example.com/e', // 超出上限 5，应被截断
        ],
      },
      fetchImpl,
    )
    const uniqueUrls = new Set(result.crawlers.map((c) => c.url))
    expect(uniqueUrls.size).toBe(5)
    expect(result.crawlers).toHaveLength(5 * TOTAL_UAS)
    expect(uniqueUrls.has('https://example.com/e')).toBe(false)
  })
})

describe('collectUaProbe — G08 llms.txt', () => {
  it('200 且非空 → exists:true 并记录 url', async () => {
    const fetchImpl = makeFetch({
      statusFor: () => 200,
      llmsTxt: { status: 200, body: '# llms\nUser-agent: *\nAllow: /' },
    })
    const result = await collectUaProbe({ entryUrl: 'https://example.com/path' }, fetchImpl)
    expect(result.llmsTxt.exists).toBe(true)
    expect(result.llmsTxt.url).toBe('https://example.com/llms.txt')
  })

  it('404 或空体 → exists:false，仍记录预期 url', async () => {
    const notFound = await collectUaProbe(
      { entryUrl: 'https://example.com/' },
      makeFetch({ llmsTxt: { status: 404, body: '' } }),
    )
    expect(notFound.llmsTxt.exists).toBe(false)
    expect(notFound.llmsTxt.url).toBe('https://example.com/llms.txt')

    const empty = await collectUaProbe(
      { entryUrl: 'https://example.com/' },
      makeFetch({ llmsTxt: { status: 200, body: '   \n  ' } }),
    )
    expect(empty.llmsTxt.exists).toBe(false)
  })
})
