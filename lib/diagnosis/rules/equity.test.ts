import { describe, it, expect } from 'vitest'
import { notChecked, type RuleContext, type RuleHitDraft } from '../types'
import type { SiteAuditPage, SiteAuditPayload } from '@/lib/crawl/site-audit'
import type { InternalLinkDetail } from '@/lib/crawl/light-check'
import { buildLinkGraph, type LinkGraphPageInput } from '@/lib/crawl/link-graph'
import { equityRules } from './equity'

const H = 'https://example.com'
const rule = (id: string) => equityRules.find((r) => r.id === id)!
type L = string | { to: string; anchor?: string; regions?: InternalLinkDetail['regions']; nofollow?: boolean }
type Spec = { links?: L[]; key?: boolean; metaRobots?: string; status?: number }

function ctxFor(pages: Record<string, Spec>, metrics: { page: string; clicks: number; impressions: number }[] = [], fetchedOnly = true): RuleContext {
  const graphPages: LinkGraphPageInput[] = []
  const auditPages: SiteAuditPage[] = []
  for (const [path, s] of Object.entries(pages)) {
    const url = `${H}${path}`
    graphPages.push({
      url, checkStatus: 'checked', httpStatus: s.status ?? 200, metaRobots: s.metaRobots ?? null, discoveredVia: path === '/' ? 'entry' : 'crawl', contentKind: 'html',
      linkDetails: (s.links ?? []).map((l) => {
        const o = typeof l === 'string' ? { to: l } : l
        return { url: `${H}${o.to}`, count: 1, anchors: [o.anchor ?? `关于${o.to.slice(1)}的介绍`], regions: o.regions ?? ['main'], nofollow: o.nofollow ?? false }
      }),
      externalLinks: [],
    })
    auditPages.push({ url, discoveredVia: 'crawl', depth: null, httpStatus: s.status ?? 200, finalUrl: null, canonicalUrl: null, metaRobots: s.metaRobots ?? null, mainTextChars: 100, inboundLinkCount: 0, checkStatus: 'checked', errorReason: null, isKeyPage: s.key ?? false })
  }
  void fetchedOnly
  const payload = {
    protocol: { maxPages: 200, maxDepth: 3 },
    stats: { totalDiscovered: 0, checked: 0, truncated: 0, http4xx: 0, http5xx: 0, errors: 0, blockedByRobots: 0, noindex: 0, canonicalOffsite: 0, orphanPages: 0, citedPages: 0 },
    pages: auditPages, templates: [], citations: [],
    linkGraph: buildLinkGraph({ entryUrl: `${H}/`, pages: graphPages }),
  } as SiteAuditPayload
  return { siteAudit: { id: 'sa1', payload }, queryPageMetrics: metrics.map((m) => ({ ...m, evidenceId: 'gsc1', query: 'q', position: 5 })) } as unknown as RuleContext
}

// 首页导航链 12 页（满足 ≥10 HTML 页）；/money 只经深层页 /deep 链接，/deep 还链向另外 5 页 → 约 0.28× 中位数。
const nav = Array.from({ length: 12 }, (_, i) => `/n${i}`)
const extras = ['/d1', '/d2', '/d3', '/d4', '/d5']
function base(): Record<string, Spec> {
  const pages: Record<string, Spec> = { '/': { links: nav.map((n) => ({ to: n, regions: ['nav'] as const })) } }
  for (const n of nav) pages[n] = { links: [{ to: '/', regions: ['nav'] }] }
  pages['/n11'] = { links: [{ to: '/', regions: ['nav'] }, '/deep'] }
  pages['/deep'] = { links: [{ to: '/', regions: ['nav'] }, '/money', ...extras] }
  pages['/money'] = { links: [{ to: '/', regions: ['nav'] }] }
  for (const d of extras) pages[d] = { links: [{ to: '/', regions: ['nav'] }] }
  return pages
}

describe('W01 高价值页内链权重偏低（spec S3 §4）', () => {
  it('GSC 点击最高的页百分位 < 50 → 命中，inferred，detail 带覆盖率', () => {
    const hit = rule('W01').evaluate(ctxFor(base(), [{ page: `${H}/money`, clicks: 80, impressions: 2000 }])) as RuleHitDraft
    expect(rule('W01').claimType).toBe('inferred')
    expect(hit.claimType).toBeUndefined()
    expect(hit.detail).toMatchObject({ count: 1, coverage: 1, examples: [{ url: `${H}/money`, clicks: 80, source: 'gsc' }] })
    expect((hit.detail as { examples: { relative: number }[] }).examples[0].relative).toBeLessThan(0.5)
    expect(hit.description).toContain('在本次抓取的链接图内')
  })
  it('没有 GSC 也没有人工重点页 → 不判定（Review Focus 3）', () => {
    expect(rule('W01').evaluate(ctxFor(base()))).toBeNull()
  })
  it('人工重点页同样适用', () => {
    const p = base()
    p['/money'] = { ...p['/money'], key: true }
    expect(rule('W01').evaluate(ctxFor(p))).not.toBeNull()
  })
})

describe('W02 权重集中在低价值页', () => {
  // 3 个 noindex 推广页被全站模板链接 → 约 3.5× 中位数
  function templated(noindexCount: number): Record<string, Spec> {
    const promos = ['/promo-a', '/promo-b', '/promo-c']
    const pages = base()
    pages['/'] = { links: [...(pages['/'].links ?? []), ...promos.map((to): L => ({ to, regions: ['footer'] }))] }
    for (const n of nav) pages[n] = { links: [...(pages[n].links ?? []), ...promos.map((to): L => ({ to, regions: ['footer'] }))] }
    promos.forEach((p, i) => { pages[p] = { links: [{ to: '/', regions: ['nav'] }], metaRobots: i < noindexCount ? 'noindex' : undefined } })
    return pages
  }
  it('前 10 名中明显高于中位数的低价值页 ≥ 3 → 命中', () => {
    const hit = rule('W02').evaluate(ctxFor(templated(3))) as RuleHitDraft
    expect(rule('W02').claimType).toBe('inferred')
    expect((hit.detail as { examples: { url: string; reasons: string[]; relative: number }[] }).examples.map((e) => e.url).sort()).toEqual([`${H}/promo-a`, `${H}/promo-b`, `${H}/promo-c`])
  })
  it('低价值页 < 3 → 不命中', () => {
    expect(rule('W02').evaluate(ctxFor(templated(2)))).toBeNull()
  })
})

describe('W03 高价值页入链锚文本泛化', () => {
  it('泛化锚文本占比 ≥ 50% 且入链 ≥ 3 → 命中，measured_hard', () => {
    const p = base()
    for (const n of ['/n0', '/n1', '/n2']) p[n] = { links: [{ to: '/', regions: ['nav'] }, { to: '/money', anchor: 'Read more »' }] }
    const hit = rule('W03').evaluate(ctxFor(p, [{ page: `${H}/money`, clicks: 50, impressions: 900 }])) as RuleHitDraft
    expect(hit.claimType).toBeUndefined()
    expect(hit.detail).toMatchObject({ count: 1, examples: [{ url: `${H}/money`, inbound: 4, genericShare: 0.75 }] })
  })
  it('入链 < 3 不判定', () => {
    expect(rule('W03').evaluate(ctxFor(base(), [{ page: `${H}/money`, clicks: 50, impressions: 900 }]))).toBeNull()
  })
})

describe('W04 高价值页缺少正文上下文内链', () => {
  it('可跟随入链中正文区占比 < 20% 且入链 ≥ 3 → 命中，inferred', () => {
    const p = base()
    for (const n of ['/n0', '/n1', '/n2', '/n3', '/n4']) p[n] = { links: [{ to: '/', regions: ['nav'] }, { to: '/money', regions: ['footer'] }] }
    p['/n11'] = { links: [{ to: '/', regions: ['nav'] }, { to: '/money', regions: ['footer'] }] }
    const hit = rule('W04').evaluate(ctxFor(p, [{ page: `${H}/money`, clicks: 50, impressions: 900 }])) as RuleHitDraft
    expect(rule('W04').claimType).toBe('inferred')
    // 6 条页脚入链 + 1 条来自 /deep 正文 → 正文占比 1/7 ≈ 0.14 < 0.2
    expect(hit.detail).toMatchObject({ count: 1, examples: [{ url: `${H}/money`, inbound: 7, mainShare: 0.14 }] })
  })
})

describe('覆盖率提示（Review Focus 4）', () => {
  it('覆盖率 < 50% 时 W01 描述追加提示', () => {
    const p = base()
    // /n0 用 nofollow 链出 25 个未抓取 URL：拉低覆盖率，但不改变可跟随边上的权重分布
    p['/n0'] = { links: [...(p['/n0'].links ?? []), ...Array.from({ length: 25 }, (_, i) => ({ to: `/unfetched-${i}`, nofollow: true }))] }
    const ctx = ctxFor(p, [{ page: `${H}/money`, clicks: 80, impressions: 2000 }])
    const hit = rule('W01').evaluate(ctx) as RuleHitDraft
    expect((hit.detail as { coverage: number }).coverage).toBeLessThan(0.5)
    expect(hit.description).toContain('抓取覆盖不足')
  })
})

describe('W01–W04 守卫：权重无法计算 → 未检查而不是没查出', () => {
  const reason = notChecked('site_condition', '没有链接图谱、入口页零出链或已抓 HTML 页少于 10，无法评估')
  const ids = ['W01', 'W02', 'W03', 'W04']
  it('旧证据没有链接图谱', () => {
    const ctx = ctxFor(base())
    const payload = { ...ctx.siteAudit!.payload }
    delete (payload as { linkGraph?: unknown }).linkGraph
    const oldCtx = { ...ctx, siteAudit: { id: 'sa1', payload } } as unknown as RuleContext
    for (const id of ids) expect(rule(id).evaluate(oldCtx)).toEqual(reason)
  })
  it('入口页零站内出链', () => {
    const ctx = ctxFor({ '/': {} })
    for (const id of ids) expect(rule(id).evaluate(ctx)).toEqual(reason)
  })
  it('已抓 HTML 页少于 10', () => {
    const ctx = ctxFor({ '/': { links: ['/a'] }, '/a': { links: ['/'] } })
    for (const id of ids) expect(rule(id).evaluate(ctx)).toEqual(reason)
  })
})

describe('扁平站点不误报（真实站点 metadocu.com 冒烟发现）', () => {
  it('每页互链、PageRank 几乎均匀时，W01/W02 都不命中', () => {
    const all = ['/', ...nav, '/privacy', '/terms', '/login']
    const pages: Record<string, Spec> = {}
    for (const p of all) pages[p] = { links: all.filter((x) => x !== p).map((to) => ({ to, regions: ['nav'] as const })), metaRobots: ['/privacy', '/terms', '/login'].includes(p) ? 'noindex' : undefined }
    const ctx = ctxFor(pages, [{ page: `${H}/n3`, clicks: 50, impressions: 900 }])
    expect(rule('W01').evaluate(ctx)).toBeNull()
    expect(rule('W02').evaluate(ctx)).toBeNull()
  })
})

describe('修复波 3（第三轮独立审查 P1-8/P2-9/P2-13）', () => {
  it('W02：页脚链接 privacy/terms/login/cart/search（行业通行做法）不命中', () => {
    const util = ['/privacy', '/terms', '/login', '/cart', '/search']
    const p = base()
    p['/'] = { links: [...(p['/'].links ?? []), ...util.map((to): L => ({ to, regions: ['footer'] }))] }
    for (const n of nav) p[n] = { links: [...(p[n].links ?? []), ...util.map((to): L => ({ to, regions: ['footer'] }))] }
    for (const u of util) p[u] = { links: [{ to: '/', regions: ['nav'] }], metaRobots: 'noindex' }
    expect(rule('W02').evaluate(ctxFor(p))).toBeNull()
  })
  it('W03/W04 不把首页当高价值页', () => {
    const p = base()
    const ctx = ctxFor(p, [{ page: `${H}/`, clicks: 999, impressions: 9999 }])
    expect(rule('W03').evaluate(ctx)).toBeNull()
    expect(rule('W04').evaluate(ctx)).toBeNull()
  })
  it('W01 的证据引用带上 GSC 证据', () => {
    const hit = rule('W01').evaluate(ctxFor(base(), [{ page: `${H}/money`, clicks: 80, impressions: 2000 }])) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['sa1', 'gsc1'])
  })
})

