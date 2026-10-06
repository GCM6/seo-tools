import { describe, it, expect, vi } from 'vitest'
import { createCrawlState, runCrawlBatch, leftoverDiscovered, type CrawlOptions } from './crawler'
import { type LightCheckPage, emptyLightCheckExtra } from './light-check'

const page = (url: string, links: string[] = []): LightCheckPage => ({
  url, finalUrl: url, httpStatus: 200, title: 't', canonicalUrl: null, metaRobots: null,
  mainTextChars: 100, contentHash: 'h', internalLinks: links,
  linkDetails: links.map((u) => ({ url: u, count: 1, anchors: [], regions: ['body' as const], nofollow: false })),
  externalLinks: [], extra: emptyLightCheckExtra(), checkStatus: 'checked', errorReason: null,
})

const opts = (over: Partial<CrawlOptions> = {}): CrawlOptions =>
  ({ maxPages: 200, maxDepth: 3, batchSize: 20, concurrency: 4, robotsTxt: '', ...over })

function siteFetch(site: Record<string, string[]>) {
  return vi.fn(async (url: string) => page(url, site[url] ?? []))
}

describe('crawler', () => {
  it('BFS 爬取内链并标注 via/both，入口 depth=0、内链逐层加深', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({
      [entry]: ['https://example.com/a', 'https://example.com/b'],
      'https://example.com/a': ['https://example.com/b'],
    })
    const state = createCrawlState(entry, ['https://example.com/b', 'https://example.com/only-sitemap'], 'example.com')
    const out = await runCrawlBatch(state, opts(), fetchImpl)
    const byUrl = Object.fromEntries(out.results.map((r) => [r.url, r]))
    expect(byUrl[entry]).toMatchObject({ discoveredVia: 'entry', depth: 0 })
    expect(byUrl['https://example.com/a']).toMatchObject({ discoveredVia: 'crawl', depth: 1 })
    // b 同时来自 sitemap 与内链 → both，且按链接深度抓取（修 D1）；only-sitemap 由 sitemap 预留抓取、深度未知
    expect(byUrl['https://example.com/b']).toMatchObject({ discoveredVia: 'both', depth: 1 })
    expect(byUrl['https://example.com/only-sitemap']).toMatchObject({ discoveredVia: 'sitemap', depth: null })
    expect(out.state.done).toBe(true)
  })

  it('maxPages 截断：多余 URL 留在 frontier 由 leftoverDiscovered 返回', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({ [entry]: ['https://example.com/1', 'https://example.com/2', 'https://example.com/3'] })
    const state = createCrawlState(entry, [], 'example.com')
    let out = await runCrawlBatch(state, opts({ maxPages: 2, batchSize: 1 }), fetchImpl)
    while (!out.state.done) out = await runCrawlBatch(out.state, opts({ maxPages: 2, batchSize: 1 }), fetchImpl)
    expect(out.state.checkedCount).toBe(2)
    expect(leftoverDiscovered(out.state).length).toBeGreaterThan(0)
  })

  it('超过 maxDepth 的链接不入队', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({
      [entry]: ['https://example.com/d1'],
      'https://example.com/d1': ['https://example.com/d2'],
      'https://example.com/d2': ['https://example.com/d3'],
    })
    const state = createCrawlState(entry, [], 'example.com')
    let out = await runCrawlBatch(state, opts({ maxDepth: 1 }), fetchImpl)
    while (!out.state.done) out = await runCrawlBatch(out.state, opts({ maxDepth: 1 }), fetchImpl)
    const urls = Object.keys(out.state.seen)
    expect(urls).toContain('https://example.com/d1')
    expect(urls).not.toContain('https://example.com/d2')
  })

  it('robots disallow 的路径不 fetch，记 blocked_by_robots', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({ [entry]: ['https://example.com/admin/x'] })
    const state = createCrawlState(entry, [], 'example.com')
    let out = await runCrawlBatch(state, opts({ robotsTxt: 'User-agent: *\nDisallow: /admin' }), fetchImpl)
    while (!out.state.done) {
      const next = await runCrawlBatch(out.state, opts({ robotsTxt: 'User-agent: *\nDisallow: /admin' }), fetchImpl)
      out = { state: next.state, results: [...out.results, ...next.results] }
    }
    const blocked = out.results.find((r) => r.url === 'https://example.com/admin/x')
    expect(blocked?.checkStatus).toBe('blocked_by_robots')
    expect(fetchImpl.mock.calls.map((c) => c[0])).not.toContain('https://example.com/admin/x')
  })

  it('链接阶段 frontier 暂空时不提前消耗 sitemap 预留：先等入口的链接回来（Review Focus 5）', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({ [entry]: ['https://example.com/l1'] })
    const state = createCrawlState(entry, ['https://example.com/s1'], 'example.com')
    await runCrawlBatch(state, opts(), fetchImpl)
    // 旧实现首块就是 [entry, s1]；链接优先应为 entry → l1 → s1。
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([entry, 'https://example.com/l1', 'https://example.com/s1'])
  })

  it('链接预算内优先抓链接，预算用尽后抓 sitemap 预留（maxPages=5 → 预留 1）', async () => {
    const entry = 'https://example.com/'
    const links = Array.from({ length: 10 }, (_, i) => `https://example.com/l${i}`)
    const sitemap = Array.from({ length: 10 }, (_, i) => `https://example.com/s${i}`)
    const fetchImpl = siteFetch({ [entry]: links })
    let out = await runCrawlBatch(createCrawlState(entry, sitemap, 'example.com'), opts({ maxPages: 5 }), fetchImpl)
    while (!out.state.done) out = await runCrawlBatch(out.state, opts({ maxPages: 5 }), fetchImpl)
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([entry, links[0], links[1], links[2], sitemap[0]])
    const left = leftoverDiscovered(out.state).map((l) => l.url)
    expect(left).toContain(links[3])
    expect(left).toContain(sitemap[1])
    expect(left).not.toContain(sitemap[0])
    expect(new Set(left).size).toBe(left.length)
  })

  it('sitemap 页被链接发现后按 BFS 深度抓取且只抓一次（修 D1）', async () => {
    const entry = 'https://example.com/'
    const a = 'https://example.com/a'
    const fetchImpl = siteFetch({ [entry]: [a], [a]: [] })
    let out = await runCrawlBatch(createCrawlState(entry, [a], 'example.com'), opts(), fetchImpl)
    const results = [...out.results]
    while (!out.state.done) {
      out = await runCrawlBatch(out.state, opts(), fetchImpl)
      results.push(...out.results)
    }
    expect(results.find((r) => r.url === a)).toMatchObject({ discoveredVia: 'both', depth: 1 })
    expect(fetchImpl.mock.calls.filter((c) => c[0] === a)).toHaveLength(1)
  })

  it('深度未知页（仅 sitemap 抓到）的出链以 depth=null 入队，不受深度上限约束', async () => {
    const entry = 'https://example.com/'
    const s = 'https://example.com/s'
    const t = 'https://example.com/t'
    const fetchImpl = siteFetch({ [entry]: [], [s]: [t] })
    let out = await runCrawlBatch(createCrawlState(entry, [s], 'example.com'), opts({ maxDepth: 0 }), fetchImpl)
    const results = [...out.results]
    while (!out.state.done) {
      out = await runCrawlBatch(out.state, opts({ maxDepth: 0 }), fetchImpl)
      results.push(...out.results)
    }
    expect(results.find((r) => r.url === t)).toMatchObject({ discoveredVia: 'crawl', depth: null })
  })

  it('请求链接的原始 href（末尾斜杠/www），结果仍以归一化 URL 为键（第二轮独立审查 #6）', async () => {
    const entry = 'https://example.com/'
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      const p = page(url === 'https://www.example.com/' ? entry : url, [])
      if (url === 'https://www.example.com/') {
        p.linkDetails = [{ url: 'https://example.com/docs', href: 'https://example.com/docs/', count: 1, anchors: [], regions: ['body'], nofollow: false }]
        p.internalLinks = ['https://example.com/docs']
      }
      return p
    })
    const state = createCrawlState(entry, ['https://example.com/s'], 'example.com', { fetchUrls: { [entry]: 'https://www.example.com/', 'https://example.com/s': 'https://example.com/s/' } })
    let out = await runCrawlBatch(state, opts(), fetchImpl)
    const results = [...out.results]
    while (!out.state.done) { out = await runCrawlBatch(out.state, opts(), fetchImpl); results.push(...out.results) }
    expect(calls).toEqual(['https://www.example.com/', 'https://example.com/docs/', 'https://example.com/s/'])
    expect(results.map((r) => r.url)).toEqual([entry, 'https://example.com/docs', 'https://example.com/s'])
  })

  it('跳转落到 robots 禁抓路径 → 记为禁抓，出链不入队（第二轮独立审查 #7）', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/go') return { ...page(url, ['https://example.com/x']), finalUrl: 'https://example.com/private/hub' }
      return page(url, url === entry ? ['https://example.com/go'] : [])
    })
    const robots = 'User-agent: *\nDisallow: /private'
    let out = await runCrawlBatch(createCrawlState(entry, [], 'example.com'), opts({ robotsTxt: robots }), fetchImpl)
    const results = [...out.results]
    while (!out.state.done) { out = await runCrawlBatch(out.state, opts({ robotsTxt: robots }), fetchImpl); results.push(...out.results) }
    expect(results.find((r) => r.url === 'https://example.com/go')).toMatchObject({ checkStatus: 'blocked_by_robots', finalUrl: 'https://example.com/private/hub', errorReason: 'redirect_to_disallowed', linkDetails: [] })
    expect(fetchImpl.mock.calls.map((c) => c[0])).not.toContain('https://example.com/x')
  })

  it('robots 同时按原始请求路径判定：Disallow: /private/ 下链接写成 /private/ 也不抓（第三轮独立审查 P2-11）', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = vi.fn(async (url: string) => {
      const p = page(url === 'https://example.com/private/' ? 'https://example.com/private' : url, [])
      if (url === entry) {
        p.linkDetails = [{ url: 'https://example.com/private', href: 'https://example.com/private/', count: 1, anchors: [], regions: ['body'], nofollow: false }]
        p.internalLinks = ['https://example.com/private']
      }
      return p
    })
    const robots = 'User-agent: *\nDisallow: /private/'
    let out = await runCrawlBatch(createCrawlState(entry, [], 'example.com'), opts({ robotsTxt: robots }), fetchImpl)
    const results = [...out.results]
    while (!out.state.done) { out = await runCrawlBatch(out.state, opts({ robotsTxt: robots }), fetchImpl); results.push(...out.results) }
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([entry])
    expect(results.find((r) => r.url === 'https://example.com/private')?.checkStatus).toBe('blocked_by_robots')
  })
})

