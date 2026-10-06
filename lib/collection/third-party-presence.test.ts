import { describe, it, expect, vi } from 'vitest'
import { checkThirdPartyPresence } from './third-party-presence'
import { MEDIAWIKI_MAXLAG_ERROR_BODY, MEDIAWIKI_TITLES_RESPONSE, REDDIT_403 } from '@/lib/test-fixtures/real-shapes'

// 真实 MediaWiki 响应里的页面对象（Metadocu 缺失 / Mercury、Notion 消歧义 / Notion (productivity software) 正常）。
const realQuery = (JSON.parse(MEDIAWIKI_TITLES_RESPONSE) as {
  query: { redirects: { from: string; to: string }[]; pages: { title: string }[] }
}).query
const page = (title: string) => realQuery.pages.find((p) => p.title === title)!
const mwBody = (titles: string[], redirects: { from: string; to: string }[] = []) =>
  JSON.stringify({ batchcomplete: true, query: { ...(redirects.length ? { redirects } : {}), pages: titles.map(page) } })

type Reply = { status: number; body: string; contentType?: string } | 'throw'

// 按 URL 路由到 Wikipedia / Reddit 的 mock fetch；记录请求 URL。
function makeFetch(opts: { wiki?: Reply; reddit?: Reply }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const target = url.includes('wikipedia.org') ? opts.wiki : opts.reddit
    if (target === 'throw') throw new TypeError('fetch failed')
    const reply = target ?? { status: 200, body: '{}' }
    return new Response(reply.body, { status: reply.status, headers: { 'content-type': reply.contentType ?? 'application/json; charset=utf-8' } })
  })
}

// 生成 n 条 Reddit 帖子，created_utc 距今 ageDays 天。
function redditPosts(n: number, ageDays: number) {
  const created = Date.now() / 1000 - ageDays * 24 * 60 * 60
  return JSON.stringify({ data: { children: Array.from({ length: n }, () => ({ data: { created_utc: created } })) } })
}
const reddit403: Reply = { status: REDDIT_403.status, contentType: REDDIT_403.contentType, body: REDDIT_403.bodyPrefix }

describe('checkThirdPartyPresence — Wikipedia 精确标题（SP-A §4.4）', () => {
  it('用 titles 精确查询：候选 = 首字母大写的品牌 + 别名，带 redirects 与 pageprops', async () => {
    const fetchImpl = makeFetch({ wiki: { status: 200, body: mwBody(['Metadocu']) }, reddit: { status: 200, body: redditPosts(0, 1) } })
    const { payload } = await checkThirdPartyPresence({ brand: 'metadocu', aliases: ['Meta Docu', 'metadocu'] }, fetchImpl)
    const wikiUrl = new URL(fetchImpl.mock.calls.map((c) => String(c[0])).find((u) => u.includes('wikipedia.org'))!)
    expect(wikiUrl.searchParams.get('titles')).toBe('Metadocu|Meta Docu')
    expect(wikiUrl.searchParams.get('redirects')).toBe('1')
    expect(wikiUrl.searchParams.get('prop')).toBe('pageprops')
    expect(wikiUrl.searchParams.get('formatversion')).toBe('2')
    expect(wikiUrl.searchParams.has('srsearch')).toBe(false)
    expect(payload.candidates).toEqual(['Metadocu', 'Meta Docu'])
  })

  it('页面缺失 → ok、exists=false', async () => {
    const fetchImpl = makeFetch({ wiki: { status: 200, body: mwBody(['Metadocu']) } })
    const { payload } = await checkThirdPartyPresence({ brand: 'metadocu' }, fetchImpl)
    expect(payload.wikipedia).toEqual({ status: 'ok', exists: false, title: null, url: null })
  })

  it('只命中消歧义页 → exists=false（disambiguation 是空串，按键存在判断）', async () => {
    const fetchImpl = makeFetch({ wiki: { status: 200, body: mwBody(['Notion']) } })
    const { payload } = await checkThirdPartyPresence({ brand: 'notion' }, fetchImpl)
    expect(payload.wikipedia).toMatchObject({ status: 'ok', exists: false })
  })

  it('别名经重定向命中正常词条 → exists=true，title 取重定向后的标题', async () => {
    const fetchImpl = makeFetch({
      wiki: { status: 200, body: mwBody(['Notion', 'Notion (productivity software)'], realQuery.redirects) },
    })
    const { payload } = await checkThirdPartyPresence({ brand: 'notion', aliases: ['Notion (app)'] }, fetchImpl)
    expect(payload.wikipedia).toEqual({
      status: 'ok', exists: true, title: 'Notion (productivity software)',
      url: 'https://en.wikipedia.org/wiki/Notion_(productivity_software)',
    })
  })

  it('500 → failed（不是"无词条"）；抛错 → network_error；非 JSON → invalid_json', async () => {
    const r500 = await checkThirdPartyPresence({ brand: 'acme' }, makeFetch({ wiki: { status: 500, body: 'oops', contentType: 'text/plain' } }))
    expect(r500.payload.wikipedia).toEqual({ status: 'failed', httpStatus: 500, reason: 'http_500' })
    const rThrow = await checkThirdPartyPresence({ brand: 'acme' }, makeFetch({ wiki: 'throw' }))
    expect(rThrow.payload.wikipedia).toEqual({ status: 'failed', httpStatus: null, reason: 'network_error' })
    const rHtml = await checkThirdPartyPresence({ brand: 'acme' }, makeFetch({ wiki: { status: 200, body: '<html></html>', contentType: 'text/html' } }))
    expect(rHtml.payload.wikipedia).toMatchObject({ status: 'failed', reason: 'invalid_json' })
  })

  it('HTTP 200 + {"error"} 信封（真实 maxlag 响应）→ failed api_maxlag，不是"无词条"（第二波审查 I1）', async () => {
    const r = await checkThirdPartyPresence({ brand: 'notion' }, makeFetch({ wiki: { status: 200, body: MEDIAWIKI_MAXLAG_ERROR_BODY } }))
    expect(r.payload.wikipedia).toEqual({ status: 'failed', httpStatus: 200, reason: 'api_maxlag' })
    // 原文照样存档，便于事后核对
    expect(r.raws.some((x) => x.source === 'wikipedia' && x.raw.body.includes('maxlag'))).toBe(true)
  })

  it('HTTP 200 但响应里没有 query.pages → failed empty_result（精确标题查询必然返回 pages）', async () => {
    const r = await checkThirdPartyPresence({ brand: 'notion' }, makeFetch({ wiki: { status: 200, body: '{"batchcomplete":true}' } }))
    expect(r.payload.wikipedia).toEqual({ status: 'failed', httpStatus: 200, reason: 'empty_result' })
  })
})

describe('checkThirdPartyPresence — Reddit（失败如实，不当 0 条）', () => {
  it('统计窗口内的帖子数', async () => {
    const { payload } = await checkThirdPartyPresence({ brand: 'Acme' }, makeFetch({ reddit: { status: 200, body: redditPosts(7, 30) } }))
    expect(payload.reddit).toEqual({ status: 'ok', mentions: 7, windowDays: 365 })
  })

  it('超出窗口的帖子被过滤', async () => {
    const { payload } = await checkThirdPartyPresence({ brand: 'Acme', windowDays: 30 }, makeFetch({ reddit: { status: 200, body: redditPosts(5, 100) } }))
    expect(payload.reddit).toEqual({ status: 'ok', mentions: 0, windowDays: 30 })
  })

  it('缺少 created_utc 的帖子按窗口内计入（服务端已 t=year 粗过滤）', async () => {
    const body = JSON.stringify({ data: { children: [{ data: {} }, { data: {} }] } })
    const { payload } = await checkThirdPartyPresence({ brand: 'Acme' }, makeFetch({ reddit: { status: 200, body } }))
    expect(payload.reddit).toMatchObject({ status: 'ok', mentions: 2 })
  })

  it('真实形态 403 拦截页 → failed http_403，不是 mentions 0', async () => {
    const { payload } = await checkThirdPartyPresence({ brand: 'metadocu' }, makeFetch({ reddit: reddit403 }))
    expect(payload.reddit).toEqual({ status: 'failed', httpStatus: 403, reason: 'http_403', windowDays: 365 })
    expect(payload.reddit).not.toHaveProperty('mentions')
  })

  it('抛错 → network_error；200 非 JSON → invalid_json', async () => {
    const rThrow = await checkThirdPartyPresence({ brand: 'Acme' }, makeFetch({ reddit: 'throw' }))
    expect(rThrow.payload.reddit).toMatchObject({ status: 'failed', reason: 'network_error' })
    const rHtml = await checkThirdPartyPresence({ brand: 'Acme' }, makeFetch({ reddit: { status: 200, body: '<html></html>', contentType: 'text/html' } }))
    expect(rHtml.payload.reddit).toMatchObject({ status: 'failed', reason: 'invalid_json' })
  })
})

describe('checkThirdPartyPresence — Reddit 200 但不是 Listing（最终审查 F1-1）', () => {
  it('200 + {} → failed invalid_shape（不是 mentions 0）', async () => {
    const r = await checkThirdPartyPresence({ brand: 'acme' }, makeFetch({ wiki: { status: 200, body: mwBody(['Metadocu']) }, reddit: { status: 200, body: '{}' } }))
    expect(r.payload.reddit).toMatchObject({ status: 'failed', httpStatus: 200, reason: 'invalid_shape' })
  })
  it('200 + {"message":"Too Many Requests","error":429} → failed api_429', async () => {
    const r = await checkThirdPartyPresence({ brand: 'acme' }, makeFetch({ wiki: { status: 200, body: mwBody(['Metadocu']) }, reddit: { status: 200, body: '{"message":"Too Many Requests","error":429}' } }))
    expect(r.payload.reddit).toMatchObject({ status: 'failed', httpStatus: 200, reason: 'api_429' })
  })
  it('合法的空 Listing（data.children 为空数组）→ ok、mentions 0', async () => {
    const r = await checkThirdPartyPresence({ brand: 'acme' }, makeFetch({ wiki: { status: 200, body: mwBody(['Metadocu']) }, reddit: { status: 200, body: '{"kind":"Listing","data":{"children":[]}}' } }))
    expect(r.payload.reddit).toMatchObject({ status: 'ok', mentions: 0 })
  })
})

describe('checkThirdPartyPresence — 载荷与原文', () => {
  it('payload 版本 2；有响应的来源都返回原文（供 evidence_raw 存档）', async () => {
    const { payload, raws } = await checkThirdPartyPresence({ brand: 'metadocu' }, makeFetch({ wiki: { status: 200, body: mwBody(['Metadocu']) }, reddit: reddit403 }))
    expect(payload.version).toBe(2)
    expect(raws.map((r) => [r.source, r.raw.status])).toEqual([['wikipedia', 200], ['reddit', 403]])
  })
  it('抛错的来源没有原文', async () => {
    const { raws } = await checkThirdPartyPresence({ brand: 'metadocu' }, makeFetch({ wiki: 'throw', reddit: 'throw' }))
    expect(raws).toEqual([])
  })
})
