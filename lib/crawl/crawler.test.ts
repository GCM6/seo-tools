import { describe, it, expect, vi } from 'vitest'
import { createCrawlState, runCrawlBatch, leftoverDiscovered, type CrawlOptions } from './crawler'
import type { LightCheckPage } from './light-check'

const page = (url: string, links: string[] = []): LightCheckPage => ({
  url, finalUrl: url, httpStatus: 200, title: 't', canonicalUrl: null, metaRobots: null,
  mainTextChars: 100, contentHash: 'h', internalLinks: links, checkStatus: 'checked', errorReason: null,
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
    let state = createCrawlState(entry, ['https://example.com/b', 'https://example.com/only-sitemap'], 'example.com')
    const out = await runCrawlBatch(state, opts(), fetchImpl)
    const byUrl = Object.fromEntries(out.results.map((r) => [r.url, r]))
    expect(byUrl[entry]).toMatchObject({ discoveredVia: 'entry', depth: 0 })
    expect(byUrl['https://example.com/a']).toMatchObject({ discoveredVia: 'crawl', depth: 1 })
    // b 同时来自 sitemap 与内链 → both；only-sitemap 无内链入度
    expect(byUrl['https://example.com/b'].discoveredVia).toBe('both')
    expect(out.state.inbound['https://example.com/b']).toBe(2)
    expect(out.state.inbound['https://example.com/only-sitemap']).toBeUndefined()
    expect(out.state.done).toBe(true)
  })

  it('maxPages 截断：多余 URL 留在 frontier 由 leftoverDiscovered 返回', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({ [entry]: ['https://example.com/1', 'https://example.com/2', 'https://example.com/3'] })
    let state = createCrawlState(entry, [], 'example.com')
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
    let state = createCrawlState(entry, [], 'example.com')
    let out = await runCrawlBatch(state, opts({ maxDepth: 1 }), fetchImpl)
    while (!out.state.done) out = await runCrawlBatch(out.state, opts({ maxDepth: 1 }), fetchImpl)
    const urls = Object.keys(out.state.seen)
    expect(urls).toContain('https://example.com/d1')
    expect(urls).not.toContain('https://example.com/d2')
  })

  it('robots disallow 的路径不 fetch，记 blocked_by_robots', async () => {
    const entry = 'https://example.com/'
    const fetchImpl = siteFetch({ [entry]: ['https://example.com/admin/x'] })
    let state = createCrawlState(entry, [], 'example.com')
    let out = await runCrawlBatch(state, opts({ robotsTxt: 'User-agent: *\nDisallow: /admin' }), fetchImpl)
    while (!out.state.done) {
      const next = await runCrawlBatch(out.state, opts({ robotsTxt: 'User-agent: *\nDisallow: /admin' }), fetchImpl)
      out = { state: next.state, results: [...out.results, ...next.results] }
    }
    const blocked = out.results.find((r) => r.url === 'https://example.com/admin/x')
    expect(blocked?.checkStatus).toBe('blocked_by_robots')
    expect(fetchImpl.mock.calls.map((c) => c[0])).not.toContain('https://example.com/admin/x')
  })
})
