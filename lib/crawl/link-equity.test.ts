import { describe, it, expect } from 'vitest'
import { analyzeLinkEquity, internalPageRank, isGenericAnchor, equityRelativeFor, MIN_HTML_PAGES } from './link-equity'
import { buildLinkGraph, readLinkGraph, type LinkGraphPageInput } from './link-graph'
import type { SiteAuditPage } from './site-audit'
import type { InternalLinkDetail } from './light-check'

const H = 'https://ex.com'
type Spec = { links?: (string | { to: string; nofollow?: boolean; anchor?: string; regions?: InternalLinkDetail['regions'] })[]; status?: number; metaRobots?: string; finalUrl?: string; key?: boolean; via?: string; canonical?: string }

function site(pages: Record<string, Spec>) {
  const graphPages: LinkGraphPageInput[] = []
  const auditPages: SiteAuditPage[] = []
  for (const [path, s] of Object.entries(pages)) {
    const url = `${H}${path}`
    graphPages.push({
      url, finalUrl: s.finalUrl ?? null, checkStatus: 'checked', httpStatus: s.status ?? 200, metaRobots: s.metaRobots ?? null,
      discoveredVia: s.via ?? (path === '/' ? 'entry' : 'crawl'), contentKind: 'html',
      linkDetails: (s.links ?? []).map((l) => {
        const o = typeof l === 'string' ? { to: l } : l
        return { url: `${H}${o.to}`, count: 1, anchors: [o.anchor ?? `关于 ${o.to}`], regions: o.regions ?? ['main'], nofollow: o.nofollow ?? false }
      }),
      externalLinks: [],
    })
    auditPages.push({
      url, discoveredVia: 'crawl', depth: null, httpStatus: s.status ?? 200, finalUrl: s.finalUrl ?? null, canonicalUrl: s.canonical ?? null,
      metaRobots: s.metaRobots ?? null, mainTextChars: 100, inboundLinkCount: 0, checkStatus: 'checked', errorReason: null, isKeyPage: s.key ?? false,
    })
  }
  return { pages: auditPages, linkGraph: buildLinkGraph({ entryUrl: `${H}/`, pages: graphPages }) }
}

// 首页链到 12 个导航页（满足最少 10 个 HTML 页）。
const nav = Array.from({ length: 12 }, (_, i) => `/n${i}`)
const base = (): Record<string, Spec> => {
  const pages: Record<string, Spec> = { '/': { links: nav } }
  for (const n of nav) pages[n] = { links: ['/'] }
  return pages
}

describe('internalPageRank（spec S3 §3）', () => {
  it('三节点环每点 1/3；总和为 1', () => {
    const g = readLinkGraph(site({ '/': { links: ['/a'] }, '/a': { links: ['/b'] }, '/b': { links: ['/'] } }))!
    const r = internalPageRank(g)
    for (const v of r.values()) expect(v).toBeCloseTo(1 / 3, 6)
  })

  it('星形：被所有页链接的中心最高；悬挂节点质量重分配后总和仍为 1；nofollow 边不传递', () => {
    const g = readLinkGraph(site({
      '/': { links: ['/a', '/b', '/c', { to: '/nf', nofollow: true }] },
      '/a': { links: ['/'] }, '/b': { links: ['/'] }, '/c': { links: [] }, '/nf': { links: [] },
    }))!
    const r = internalPageRank(g)
    const sum = [...r.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 6)
    expect(r.get(`${H}/`)!).toBeGreaterThan(r.get(`${H}/a`)!)
    expect(r.get(`${H}/nf`)!).toBeLessThan(r.get(`${H}/a`)!)
  })
})

describe('isGenericAnchor（Review Focus 5）', () => {
  it.each(['Read more »', 'Learn More', 'click here', '了解更多>', '查看详情 →', '更多', '  ', 'here.'])('%s 是泛化锚文本', (a) => {
    expect(isGenericAnchor(a)).toBe(true)
  })
  it.each(['Pricing plans', '价格方案', 'Read more about pricing'])('%s 不是', (a) => {
    expect(isGenericAnchor(a)).toBe(false)
  })
})

describe('analyzeLinkEquity（spec S3 §3）', () => {
  it('HTML 页少于 MIN_HTML_PAGES → null；入口零出链 → null（Review Focus 2）', () => {
    expect(MIN_HTML_PAGES).toBe(10)
    expect(analyzeLinkEquity({ payload: site({ '/': { links: ['/a'] }, '/a': {} }), queryPageMetrics: [] })).toBeNull()
    const p = base()
    p['/'] = { links: [] }
    expect(analyzeLinkEquity({ payload: site(p), queryPageMetrics: [] })).toBeNull()
  })

  it('相对权重 = 该页 PageRank / 已抓 HTML 页中位数；首页明显高于中位数，导航页约等于中位数', () => {
    const e = analyzeLinkEquity({ payload: site(base()), queryPageMetrics: [] })!
    expect(e.htmlCount).toBe(13)
    expect(e.relative.get(`${H}/`)!).toBeGreaterThan(3)
    expect(e.relative.get(`${H}/n5`)!).toBeCloseTo(1, 6)
    expect(e.coverage).toBe(1)
  })

  it('扁平站点（每页互链）相对权重都接近 1，不会把微小差异放大（真实站点 metadocu.com 冒烟发现）', () => {
    const pages: Record<string, Spec> = {}
    const all = ['/', ...nav]
    for (const p of all) pages[p] = { links: all.filter((x) => x !== p) }
    const e = analyzeLinkEquity({ payload: site(pages), queryPageMetrics: [] })!
    for (const v of e.relative.values()) expect(v).toBeCloseTo(1, 3)
  })

  it('GSC 页面对齐：同页多查询求和、www/末尾斜杠/跳转前地址都能对齐；取前 20% 且有点击或展现 ≥50（Review Focus 1）', () => {
    const p = base()
    p['/old-pricing'] = { finalUrl: `${H}/pricing` }
    p['/pricing'] = { links: ['/'] }
    p['/n0'] = { links: ['/', '/old-pricing'] }
    const e = analyzeLinkEquity({
      payload: site(p),
      queryPageMetrics: [
        { page: 'https://www.ex.com/pricing/', clicks: 30, impressions: 900 },
        { page: `${H}/old-pricing`, clicks: 20, impressions: 100 },
        { page: `${H}/n1`, clicks: 1, impressions: 10 },
        { page: `${H}/n2`, clicks: 0, impressions: 40 },
        { page: `${H}/n3`, clicks: 0, impressions: 10 },
      ],
    })!
    expect(e.hasGsc).toBe(true)
    expect(e.valuePages).toEqual([{ url: `${H}/pricing`, source: 'gsc', clicks: 50, impressions: 1000, evidenceIds: [] }])
  })

  it('人工重点页并入高价值页；同时在 GSC 前列则 source=both', () => {
    const p = base()
    p['/n5'] = { links: ['/'], key: true }
    p['/n6'] = { links: ['/'], key: true }
    const e = analyzeLinkEquity({ payload: site(p), queryPageMetrics: [{ page: `${H}/n6`, clicks: 9, impressions: 99 }] })!
    expect(e.valuePages.map((v) => [v.url.replace(H, ''), v.source])).toEqual([['/n6', 'both'], ['/n5', 'key']])
  })

  it('低价值页原因：noindex / canonical 指向他页 / 分页；功能页不计入，零展现不再判定（第三轮独立审查 P1-8）', () => {
    const p = base()
    Object.assign(p, {
      '/n0': { links: ['/'], metaRobots: 'noindex' },
      '/n1': { links: ['/'], canonical: `${H}/n2` },
      '/privacy': { links: ['/'], metaRobots: 'noindex' },
      '/blog/page/2': { links: ['/'] },
      '/blog/tag/seo': { links: ['/'] },
      '/?p=101': { links: ['/'] },
    })
    p['/'] = { links: [...nav, '/privacy', '/blog/page/2', '/blog/tag/seo'] }
    const e = analyzeLinkEquity({ payload: site(p), queryPageMetrics: [{ page: `${H}/n3`, clicks: 1, impressions: 60 }] })!
    expect(e.lowValue.get(`${H}/n0`)).toEqual(['noindex'])
    expect(e.lowValue.get(`${H}/n1`)).toEqual(['canonical'])
    expect(e.lowValue.has(`${H}/privacy`)).toBe(false) // 功能页：全站链接是正常做法（与 S2/TR06 一致）
    expect(e.lowValue.get(`${H}/blog/page/2`)).toEqual(['pagination'])
    expect(e.lowValue.get(`${H}/blog/tag/seo`)).toEqual(['pagination'])
    expect(e.lowValue.has(`${H}/n4`)).toBe(false) // GSC 只给前 1000 行 page×query，缺席 ≠ 零展现
  })

  it('WordPress 朴素固定链接 /?p=101 是文章 ID，不是分页', () => {
    const p = base()
    p['/'] = { links: [...nav, '/?p=101'] }
    p['/?p=101'] = { links: ['/'] }
    const e = analyzeLinkEquity({ payload: site(p), queryPageMetrics: [] })!
    expect(e.lowValue.has(`${H}/?p=101`)).toBe(false)
  })
})

describe('equityRelativeFor（UI）', () => {
  it('已抓 HTML 页给相对权重（保留 2 位小数），未知 URL 与样本不足时为 null', () => {
    const cell = equityRelativeFor(site(base()))
    expect(cell(`${H}/n5`)).toBe(1)
    expect(cell(`${H}/`)!).toBeGreaterThan(3)
    expect(cell(`${H}/missing`)).toBeNull()
    expect(equityRelativeFor(site({ '/': { links: ['/a'] }, '/a': {} }))(`${H}/`)).toBeNull()
  })
})
