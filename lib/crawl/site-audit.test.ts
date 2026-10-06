import { describe, it, expect } from 'vitest'
import { buildSiteAudit, type SiteAuditPage } from './site-audit'
import { buildLinkGraph } from './link-graph'

const page = (over: Partial<SiteAuditPage>): SiteAuditPage => ({
  url: 'https://a.com/x', discoveredVia: 'crawl', depth: 1, httpStatus: 200, finalUrl: null,
  canonicalUrl: null, metaRobots: null, mainTextChars: 100, inboundLinkCount: 1,
  checkStatus: 'checked', errorReason: null, isKeyPage: false, ...over,
})

describe('buildSiteAudit', () => {
  it('统计 404/noindex/站外 canonical/孤岛/截断', () => {
    const out = buildSiteAudit({
      pages: [
        page({ url: 'https://a.com/' , discoveredVia: 'entry', depth: 0 }),
        page({ url: 'https://a.com/404', httpStatus: 404 }),
        page({ url: 'https://a.com/ni', metaRobots: 'noindex,follow' }),
        page({ url: 'https://a.com/co', canonicalUrl: 'https://other.com/x' }),
        page({ url: 'https://a.com/orphan', discoveredVia: 'sitemap', depth: null, inboundLinkCount: 0 }),
        page({ url: 'https://a.com/later', checkStatus: 'discovered_only', httpStatus: null }),
      ],
      templates: [{ pattern: '/', pageCount: 1, representativeUrl: 'https://a.com/' }],
      citedUrls: [],
      entryHost: 'a.com',
      maxPages: 200,
      maxDepth: 3,
    })
    expect(out.stats).toMatchObject({
      totalDiscovered: 6, checked: 5, truncated: 1, http4xx: 1, noindex: 1,
      canonicalOffsite: 1, orphanPages: 1,
    })
    expect(out.protocol).toEqual({ maxPages: 200, maxDepth: 3 })
  })

  it('citations 归一化后按页计数（www/尾斜杠差异也能命中）', () => {
    const out = buildSiteAudit({
      pages: [page({ url: 'https://a.com/p' })],
      templates: [],
      citedUrls: ['https://www.a.com/p/', 'https://a.com/p', 'https://other.com/x'],
      entryHost: 'a.com',
      maxPages: 200,
      maxDepth: 3,
    })
    expect(out.citations).toEqual([{ url: 'https://a.com/p', count: 2 }])
    expect(out.stats.citedPages).toBe(1)
  })

  it('挂载 linkGraph：pages[].depth 取图谱深度，协议记录抓取策略（spec S1 §6）', () => {
    const graph = buildLinkGraph({
      entryUrl: 'https://a.com/',
      pages: [
        { url: 'https://a.com/', checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'entry', linkDetails: [{ url: 'https://a.com/x', count: 1, anchors: [], regions: ['main'], nofollow: false }], externalLinks: [] },
        { url: 'https://a.com/x', checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'both', linkDetails: [], externalLinks: [] },
      ],
    })
    const out = buildSiteAudit({
      pages: [page({ url: 'https://a.com/', discoveredVia: 'entry', depth: 0 }), page({ url: 'https://a.com/x', discoveredVia: 'both', depth: null })],
      templates: [], citedUrls: [], entryHost: 'a.com', maxPages: 200, maxDepth: 3,
      linkGraph: graph, crawlStrategy: 'link_first_v1', sitemapReserveRatio: 0.2,
    })
    expect(out.pages.map((p) => p.depth)).toEqual([0, 1])
    expect(out.protocol).toEqual({ maxPages: 200, maxDepth: 3, crawlStrategy: 'link_first_v1', sitemapReserveRatio: 0.2 })
    expect(out.linkGraph).toBe(graph)
  })
})
