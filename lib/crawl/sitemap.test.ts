import { describe, it, expect, vi } from 'vitest'
import { sitemapUrlsFromRobots, extractLocs, discoverSitemaps } from './sitemap'

const xmlUrlset = (urls: string[]) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${u}</loc></url>`)
    .join('')}</urlset>`

const xmlIndex = (urls: string[]) =>
  `<?xml version="1.0"?><sitemapindex>${urls.map((u) => `<sitemap><loc>${u}</loc></sitemap>`).join('')}</sitemapindex>`

function fakeFetch(routes: Record<string, { status: number; body: string }>) {
  return vi.fn(async (url: string) => {
    const r = routes[url] ?? { status: 404, body: '' }
    return { status: r.status, text: async () => r.body, headers: new Headers(), url } as unknown as Response
  })
}

describe('sitemapUrlsFromRobots', () => {
  it('提取 Sitemap: 行（大小写不敏感），无声明返回空数组', () => {
    expect(sitemapUrlsFromRobots('User-agent: *\nSitemap: https://a.com/s.xml\nsitemap:https://a.com/s2.xml'))
      .toEqual(['https://a.com/s.xml', 'https://a.com/s2.xml'])
    expect(sitemapUrlsFromRobots('User-agent: *\nDisallow:')).toEqual([])
  })
})

describe('extractLocs', () => {
  it('区分 index 与 urlset，支持 CDATA', () => {
    expect(extractLocs(xmlIndex(['https://a.com/s1.xml']))).toEqual({ isIndex: true, locs: ['https://a.com/s1.xml'] })
    expect(extractLocs('<urlset><url><loc><![CDATA[ https://a.com/p ]]></loc></url></urlset>'))
      .toEqual({ isIndex: false, locs: ['https://a.com/p'] })
  })
})

describe('discoverSitemaps', () => {
  it('robots 无声明时回退 /sitemap.xml，URL 经归一化去重', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/sitemap.xml': { status: 200, body: xmlUrlset(['https://www.example.com/a/', 'https://example.com/a']) },
    })
    const out = await discoverSitemaps('https://example.com/', '', fetchImpl)
    expect(out.files).toHaveLength(1)
    expect(out.pageUrls).toEqual(['https://example.com/a'])
  })

  it('sitemap index 递归读取子文件', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/s.xml': { status: 200, body: xmlIndex(['https://example.com/s1.xml']) },
      'https://example.com/s1.xml': { status: 200, body: xmlUrlset(['https://example.com/p1']) },
    })
    const out = await discoverSitemaps('https://example.com/', 'Sitemap: https://example.com/s.xml', fetchImpl)
    expect(out.files.map((f) => f.url)).toEqual(['https://example.com/s.xml', 'https://example.com/s1.xml'])
    expect(out.pageUrls).toEqual(['https://example.com/p1'])
  })

  it('抓取失败降级：记 warning 不抛错', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('boom') })
    const out = await discoverSitemaps('https://example.com/', 'Sitemap: https://example.com/s.xml', fetchImpl as never)
    expect(out.pageUrls).toEqual([])
    expect(out.warnings[0]).toContain('sitemap_fetch_failed')
  })
})
