import { describe, it, expect } from 'vitest'
import { buildLinkGraph } from '@/lib/crawl/link-graph'
import { fetchLightCheck } from '@/lib/crawl/light-check'
import type { RuleContext, RuleEvaluation, RuleHitDraft } from '../types'
import type { SiteAuditPage, SiteAuditPayload, SiteAuditTemplate } from '@/lib/crawl/site-audit'
import { contentRules } from './content'
import { buildRuleContext } from '../context'
import { templates } from '../templates'
import { WOOCOMMERCE_PRODUCT_JSONLD, WOOCOMMERCE_PRODUCT_PAGE_URL, YOAST_ARTICLE_JSONLD, YOAST_ARTICLE_PAGE_URL, jsonLdScript, schemaEvidenceFromHtml } from '@/lib/test-fixtures/real-shapes'

const rule = (id: string) => contentRules.find((r) => r.id === id)!

const asOne = (r: RuleEvaluation) => (Array.isArray(r) ? r[0] : r) as RuleHitDraft
const asArr = (r: RuleEvaluation) => (Array.isArray(r) ? r : r ? [r] : []) as RuleHitDraft[]

const page = (p: Partial<SiteAuditPage>): SiteAuditPage => ({
  url: 'https://example.com/x',
  discoveredVia: 'crawl',
  depth: 1,
  httpStatus: 200,
  finalUrl: null,
  canonicalUrl: null,
  metaRobots: null,
  mainTextChars: 1000,
  inboundLinkCount: 5,
  checkStatus: 'checked',
  errorReason: null,
  isKeyPage: false,
  contentHash: null,
  templateId: null,
  ...p,
})

const audit = (pages: SiteAuditPage[], templates: SiteAuditTemplate[] = []): { id: string; payload: SiteAuditPayload } => ({
  id: 'sa1',
  payload: {
    protocol: { maxPages: 100, maxDepth: 5 },
    stats: {
      totalDiscovered: pages.length, checked: pages.length, truncated: 0, http4xx: 0, http5xx: 0,
      errors: 0, blockedByRobots: 0, noindex: 0, canonicalOffsite: 0, orphanPages: 0, citedPages: 0,
    },
    pages,
    templates,
    citations: [],
  },
})

const schema = (o: Partial<RuleContext['schemas'][number]>): RuleContext['schemas'][number] => ({
  id: 'sc1', source: 'jsonld', sitePageId: null, types: [], sameAs: [], raw: [], blocks: [], ...o,
})

const renderCheck = (o: Partial<RuleContext['renderChecks'][number]>): RuleContext['renderChecks'][number] => ({
  id: 'rc1', source: 'https://example.com/', sitePageId: null, initialChars: 500, renderedChars: 500, delta: 0, renderedText: '', ...o,
})

const baseCtx = (): RuleContext => ({
  project: { domain: 'example.com', industry: '', market: 'US', language: 'en', competitors: [] },
  siteAudit: null,
  entryPage: null,
  renderChecks: [],
  schemas: [],
  probe: null,
  probeEvidenceId: null,
  robotsText: null,
  psiChecks: [],
  keywordMetrics: [],
  queryPageMetrics: [],
  dataforseo: { configured: false, serpByKeyword: [], keywordData: [], backlinks: [], bingIndex: null, brandSerp: null },
  confirmedCompetitors: [],
  keywordGaps: [],
  uaProbe: null,
  thirdParty: null,
  socialPresence: null,
})

const withEntry = (html: string): RuleContext => {
  const ctx = baseCtx()
  ctx.entryPage = {
    id: 'ep1',
    rawHtml: html,
    canonicalUrl: 'https://example.com/',
    metaRobots: null,
    robotsAllowed: true,
  }
  return ctx
}

describe('C01 title', () => {
  it('missing title', () => {
    const hit = rule('C01').evaluate(withEntry('<html><head></head><body></body></html>')) as RuleHitDraft
    expect(hit.title).toBe('入口页缺少 <title>')
    expect(hit.evidenceRefs).toEqual(['ep1'])
  })
  it('too long title', () => {
    const long = 'a'.repeat(70)
    const hit = rule('C01').evaluate(withEntry(`<title>${long}</title>`)) as RuleHitDraft
    expect(hit.detail!.length).toBe(70)
  })
  it('ok title null', () => {
    expect(rule('C01').evaluate(withEntry('<title>Good Title</title>'))).toBeNull()
  })
})

describe('C02 meta description', () => {
  it('missing', () => {
    const hit = rule('C02').evaluate(withEntry('<title>t</title>')) as RuleHitDraft
    expect(hit.title).toBe('入口页缺少 meta description')
  })
  it('present null', () => {
    expect(
      rule('C02').evaluate(withEntry('<meta name="description" content="hello world">')),
    ).toBeNull()
  })
})

describe('C03 h1', () => {
  it('missing h1', () => {
    const hit = rule('C03').evaluate(withEntry('<title>t</title>')) as RuleHitDraft
    expect(hit.title).toBe('入口页缺少 H1')
  })
  it('multiple h1', () => {
    const hit = rule('C03').evaluate(withEntry('<h1>a</h1><h1>b</h1>')) as RuleHitDraft
    expect(hit.detail!.h1Count).toBe(2)
  })
  it('h1 duplicates title', () => {
    const hit = rule('C03').evaluate(withEntry('<title>Same</title><h1>Same</h1>')) as RuleHitDraft
    expect(hit.title).toBe('入口页 H1 与 title 完全相同')
  })
  it('H1 与 title 相同只是说明（notice / hypothesis）：不是错误；缺 H1、多个 H1 仍是 warning（SP-A §5.2）', () => {
    const same = rule('C03').evaluate(withEntry('<title>Same</title><h1>Same</h1>')) as RuleHitDraft
    expect(same.severity).toBe('notice')
    expect(same.claimType).toBe('hypothesis')
    expect(same.description).toContain('这不是错误')
    const missing = rule('C03').evaluate(withEntry('<title>t</title>')) as RuleHitDraft
    const multiple = rule('C03').evaluate(withEntry('<h1>a</h1><h1>b</h1>')) as RuleHitDraft
    expect(missing.severity ?? rule('C03').severity).toBe('warning')
    expect(multiple.severity ?? rule('C03').severity).toBe('warning')
  })
  it('single distinct h1 null', () => {
    expect(rule('C03').evaluate(withEntry('<title>Title</title><h1>Heading</h1>'))).toBeNull()
  })
})

describe('C05a schema', () => {
  it('flags deprecated FAQ/HowTo', () => {
    const ctx = baseCtx()
    ctx.schemas = [{ id: 'sc1', source: 'jsonld', sitePageId: null, types: ['FAQPage'], sameAs: [], raw: [], blocks: [] }]
    const hits = rule('C05a').evaluate(ctx) as RuleHitDraft[]
    const dep = hits.find((h) => h.scope === 'schema:deprecated')
    expect(dep).toBeTruthy()
    expect(dep!.evidenceRefs).toEqual(['sc1'])
  })
  it('flags missing recommended types', () => {
    const ctx = baseCtx()
    ctx.schemas = [{ id: 'sc1', source: 'jsonld', sitePageId: null, types: ['WebSite'], sameAs: [], raw: [], blocks: [] }]
    const hits = rule('C05a').evaluate(ctx) as RuleHitDraft[]
    expect(hits.some((h) => h.scope === 'schema:missing-recommended')).toBe(true)
  })
  it('null when recommended present and no deprecated', () => {
    const ctx = baseCtx()
    ctx.schemas = [{ id: 'sc1', source: 'jsonld', sitePageId: null, types: ['Organization'], sameAs: [], raw: [], blocks: [] }]
    expect(rule('C05a').evaluate(ctx)).toBeNull()
  })
  it('null when no schemas at all (no evidence to ref)', () => {
    expect(rule('C05a').evaluate(baseCtx())).toBeNull()
  })
})

describe('C04 thin content', () => {
  it('flags thin commercial template via representative page', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit(
      [page({ url: 'https://example.com/products/1', mainTextChars: 120 })],
      [{ pattern: '/products/{id}', pageCount: 12, representativeUrl: 'https://example.com/products/1' }],
    )
    const hits = asArr(rule('C04').evaluate(ctx))
    expect(hits).toHaveLength(1)
    expect(hits[0].scope).toBe('/products/{id}')
    expect(hits[0].evidenceRefs).toEqual(['sa1'])
    expect(hits[0].detail!.mainTextChars).toBe(120)
  })
  it('ignores informational (blog) templates', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit(
      [page({ url: 'https://example.com/blog/x', mainTextChars: 80 })],
      [{ pattern: '/blog/{slug}', pageCount: 20, representativeUrl: 'https://example.com/blog/x' }],
    )
    expect(rule('C04').evaluate(ctx)).toBeNull()
  })
  it('ignores commercial template with enough content', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit(
      [page({ url: 'https://example.com/products/1', mainTextChars: 800 })],
      [{ pattern: '/products/{id}', pageCount: 12, representativeUrl: 'https://example.com/products/1' }],
    )
    expect(rule('C04').evaluate(ctx)).toBeNull()
  })
  it('null without siteAudit', () => {
    expect(rule('C04').evaluate(baseCtx())).toBeNull()
  })
})

describe('C05b JSON-LD syntax/@context', () => {
  it('flags block parse failure', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ id: 'scA', blocks: [{ ok: false, rawText: '{bad json' }] })]
    const hit = asOne(rule('C05b').evaluate(ctx))
    expect(hit.scope).toBe('schema:syntax')
    expect(hit.evidenceRefs).toEqual(['scA'])
    expect(hit.detail!.syntaxErrors).toBe(1)
  })
  it('flags wrong/missing @context', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ id: 'scB', raw: [{ '@context': 'https://example.org', '@type': 'Product', name: 'x' }] })]
    const hit = asOne(rule('C05b').evaluate(ctx))
    expect(hit.evidenceRefs).toEqual(['scB'])
    expect(hit.detail!.contextErrors).toBe(1)
  })
  it('passes valid schema.org @context', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ raw: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'x' }], blocks: [{ ok: true, rawText: '{}' }] })]
    expect(rule('C05b').evaluate(ctx)).toBeNull()
  })
})

// 走真实链路：HTML → extractSchema → schema 证据行（collect-evidence 落库形状）→ buildRuleContext → 规则。
const ctxFromPages = (pages: { url: string; html: string }[]): RuleContext =>
  buildRuleContext({
    project: { domain: 'example.com', industry: '', market: 'global-en', language: 'en', competitors: [] },
    evidence: pages.map((p, i) => schemaEvidenceFromHtml(p.html, { id: `sc${i + 1}`, source: p.url })),
    probe: null,
  })
const pageWith = (url: string, jsonLd: unknown) => ({ url, html: jsonLdScript(JSON.stringify(jsonLd)) })
const byScope = (hits: RuleHitDraft[], scope: string) => hits.filter((h) => h.scope === scope)

describe('C05b @context（真实形态）', () => {
  it('Yoast 单块 @graph（@context 只在外层）不误报', () => {
    const ctx = ctxFromPages([{ url: YOAST_ARTICLE_PAGE_URL, html: jsonLdScript(YOAST_ARTICLE_JSONLD) }])
    expect(ctx.schemas[0].types).toContain('Article')
    expect(rule('C05b').evaluate(ctx)).toBeNull()
  })
  it('顶层数组里某个元素缺 @context → 命中', () => {
    const ctx = ctxFromPages([pageWith('https://acme.example/', [
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme', url: 'https://acme.example/' },
      { '@type': 'WebSite', name: 'Acme', url: 'https://acme.example/' },
    ])])
    const hit = asOne(rule('C05b').evaluate(ctx))
    expect(hit.evidenceRefs).toEqual(['sc1'])
    expect(hit.detail!.contextErrors).toBe(1)
  })
  it('只说坏块被忽略、不夸大成"整体失效"，并写明页面 URL（真实形态：评分挂件单独输出无 @context 的块）', () => {
    const url = 'https://shop.example/products/runner'
    const html = jsonLdScript(JSON.stringify({ '@context': 'https://schema.org/', '@type': 'ProductGroup', name: 'Runner', productGroupID: '1' }))
      + jsonLdScript(JSON.stringify({ aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 120 } }))
    const hit = asOne(rule('C05b').evaluate(ctxFromPages([{ url, html }])))
    expect(hit.description).toContain(url)
    expect(hit.description).toContain('被 Google 忽略')
    expect(hit.description).not.toContain('整体失效')
  })
})

describe('C05c 必填 / 推荐拆分（Google 结构化数据文档 2026-09 版）', () => {
  it('Yoast 真实文章页：字段齐全，不产生任何命中', () => {
    const ctx = ctxFromPages([{ url: YOAST_ARTICLE_PAGE_URL, html: jsonLdScript(YOAST_ARTICLE_JSONLD) }])
    expect(rule('C05c').evaluate(ctx)).toBeNull()
  })

  it('Article 只有 headline + author：不算不符合要求，只出一条推荐字段 notice（带页面 URL）', () => {
    const url = 'https://blog.example/post-1/'
    const ctx = ctxFromPages([pageWith(url, { '@context': 'https://schema.org', '@type': 'Article', headline: 'How to x', author: { '@type': 'Person', name: 'Jane' } })])
    const hits = asArr(rule('C05c').evaluate(ctx))
    expect(byScope(hits, 'schema:required')).toHaveLength(0)
    const rec = byScope(hits, 'schema:recommended')
    expect(rec).toHaveLength(1)
    expect(rec[0].severity).toBe('notice')
    expect(rec[0].title).toBe('缺少 Google 推荐字段')
    expect(rec[0].description).toContain(url)
    expect(rec[0].description).toContain('datePublished')
    expect(rec[0].description).toContain('image')
    expect(rec[0].detail!.examples).toEqual([{ url, type: 'Article', missing: ['image', 'datePublished', 'dateModified'] }])
    expect(JSON.stringify(hits)).not.toContain('无法生成')
  })

  it('Product 只有 name + image：缺三选一 → warning（不符合 Google 富媒体结果要求）', () => {
    const url = 'https://shop.example/p/widget'
    const ctx = ctxFromPages([pageWith(url, { '@context': 'https://schema.org', '@type': 'Product', name: 'Widget', image: 'https://shop.example/w.jpg' })])
    const req = byScope(asArr(rule('C05c').evaluate(ctx)), 'schema:required')
    expect(req).toHaveLength(1)
    expect(req[0].severity).toBe('warning')
    expect(req[0].title).toBe('不符合 Google 富媒体结果要求')
    expect(req[0].description).toContain(url)
    expect(req[0].description).toContain('review、aggregateRating 或 offers 至少一项')
    expect(req[0].evidenceRefs).toEqual(['sc1'])
  })

  it('自家修复模板 JSONLD_SNIPPET（Product：name + offers.price）不触发必填命中', () => {
    const snippet = templates.C05c.fixSnippet!
    const ctx = ctxFromPages([{ url: 'https://shop.example/p/sample', html: snippet }])
    expect(ctx.schemas[0].types).toEqual(['Product'])
    expect(byScope(asArr(rule('C05c').evaluate(ctx)), 'schema:required')).toHaveLength(0)
  })

  it('SoftwareApplication 有 name + offers.price，但没有评分或评论 → warning', () => {
    const ctx = ctxFromPages([pageWith('https://app.example/', {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Scrubber', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    })])
    const req = byScope(asArr(rule('C05c').evaluate(ctx)), 'schema:required')
    expect(req).toHaveLength(1)
    expect(req[0].description).toContain('aggregateRating 或 review 至少一项')
  })

  it('Restaurant（LocalBusiness 子类型）缺 address → warning', () => {
    const ctx = ctxFromPages([pageWith('https://eat.example/', { '@context': 'https://schema.org', '@type': 'Restaurant', name: 'Pasta Place' })])
    const req = byScope(asArr(rule('C05c').evaluate(ctx)), 'schema:required')
    expect(req).toHaveLength(1)
    expect(req[0].description).toContain('（Restaurant）：缺 address')
  })

  it('全远程 JobPosting 用 applicantLocationRequirements 代替 jobLocation，不算缺必填', () => {
    const ctx = ctxFromPages([pageWith('https://jobs.example/1', {
      '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Engineer', description: '<p>Build things</p>', datePosted: '2026-09-01',
      hiringOrganization: { '@type': 'Organization', name: 'Acme' }, jobLocationType: 'TELECOMMUTE',
      applicantLocationRequirements: { '@type': 'Country', name: 'USA' },
    })])
    expect(byScope(asArr(rule('C05c').evaluate(ctx)), 'schema:required')).toHaveLength(0)
  })

  it('超过 5 处只列前 5 条并注明总数', () => {
    const pages = Array.from({ length: 6 }, (_, i) => pageWith(`https://shop.example/p/${i + 1}`, { '@context': 'https://schema.org', '@type': 'Product', name: `P${i + 1}` }))
    const req = byScope(asArr(rule('C05c').evaluate(ctxFromPages(pages))), 'schema:required')
    expect(req[0].description).toContain('https://shop.example/p/5')
    expect(req[0].description).not.toContain('https://shop.example/p/6')
    expect(req[0].description).toContain('等 6 处')
    expect(req[0].evidenceRefs).toHaveLength(6)
  })

  it('真实 WooCommerce 产品页（offers 为数组、价格在 priceSpecification 数组里）→ 不误报', () => {
    const ctx = ctxFromPages([{ url: WOOCOMMERCE_PRODUCT_PAGE_URL, html: jsonLdScript(WOOCOMMERCE_PRODUCT_JSONLD) }])
    expect(ctx.schemas[0].types).toContain('Product')
    expect(rule('C05c').evaluate(ctx)).toBeNull()
  })

  // JSON-LD 节点引用：{"@id": X} 指向同页另一个节点（JSON-LD 1.1 §4.3 node identifiers）。第二波审查 I6。
  const appWithOfferRef = (offerId: string) => ({
    '@type': 'SoftwareApplication', '@id': 'https://app.example/#app', name: 'Scrubber', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web',
    offers: { '@id': offerId }, aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.8, ratingCount: 120 },
  })
  const offerNode = { '@type': 'Offer', '@id': 'https://app.example/#offer', price: '0', priceCurrency: 'USD' }

  it('offers 用 {"@id"} 引用同一 @graph 里的 Offer 节点 → 按被引用节点判断，不报缺 offers.price', () => {
    const ctx = ctxFromPages([pageWith('https://app.example/', { '@context': 'https://schema.org', '@graph': [appWithOfferRef('https://app.example/#offer'), offerNode] })])
    expect(byScope(asArr(rule('C05c').evaluate(ctx)), 'schema:required')).toHaveLength(0)
  })

  it('被引用节点在同页另一个 JSON-LD 块里 → 同样能解析', () => {
    const html = jsonLdScript(JSON.stringify({ '@context': 'https://schema.org', ...appWithOfferRef('https://app.example/#offer') })) +
      jsonLdScript(JSON.stringify({ '@context': 'https://schema.org', ...offerNode }))
    const ctx = ctxFromPages([{ url: 'https://app.example/', html }])
    expect(byScope(asArr(rule('C05c').evaluate(ctx)), 'schema:required')).toHaveLength(0)
  })

  it('引用的 @id 在本页找不到（悬空引用）→ 仍报缺 offers.price', () => {
    const ctx = ctxFromPages([pageWith('https://app.example/', { '@context': 'https://schema.org', '@graph': [appWithOfferRef('https://app.example/#missing'), offerNode] })])
    const req = byScope(asArr(rule('C05c').evaluate(ctx)), 'schema:required')
    expect(req).toHaveLength(1)
    expect(req[0].description).toContain('offers.price')
  })

  it('ignores deprecated FAQPage (not in vocab)', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ raw: [{ '@context': 'https://schema.org', '@type': 'FAQPage' }] })]
    expect(rule('C05c').evaluate(ctx)).toBeNull()
  })
})

describe('C05d schema/frontend consistency', () => {
  it('flags JSON-LD value absent from rendered text', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ id: 'scM', sitePageId: null, raw: [{ '@context': 'https://schema.org', '@type': 'Product', name: 'Ghost Product' }] })]
    ctx.renderChecks = [renderCheck({ sitePageId: null, renderedText: 'This page sells other things entirely.' })]
    const hit = asOne(rule('C05d').evaluate(ctx))
    expect(hit.scope).toBe('schema:mismatch')
    expect(hit.evidenceRefs).toEqual(['scM'])
  })
  it('passes when value present (normalized substring)', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ sitePageId: null, raw: [{ '@context': 'https://schema.org', '@type': 'Product', name: 'Real Widget' }] })]
    ctx.renderChecks = [renderCheck({ sitePageId: null, renderedText: 'Buy the   REAL widget today' })]
    expect(rule('C05d').evaluate(ctx)).toBeNull()
  })
  it('flags nested Offer.price mismatch', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ sitePageId: null, raw: [{ '@context': 'https://schema.org', '@type': 'Product', name: 'W', offers: { '@type': 'Offer', price: '999.00' } }] })]
    ctx.renderChecks = [renderCheck({ sitePageId: null, renderedText: 'W costs 12.00 dollars' })]
    const hit = asOne(rule('C05d').evaluate(ctx))
    const mm = hit.detail!.mismatches as { field: string }[]
    expect(mm.some((m) => m.field === 'offers.price')).toBe(true)
  })
  it('null when no renderChecks (cannot verify)', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ raw: [{ '@context': 'https://schema.org', '@type': 'Product', name: 'X' }] })]
    expect(rule('C05d').evaluate(ctx)).toBeNull()
  })
})

describe('C06 E-E-A-T proxy signals', () => {
  it('flags missing author/date/about and labels as proxy', () => {
    const hit = asOne(rule('C06').evaluate(withEntry('<title>t</title><h1>h</h1><p>plain content</p>')))
    expect((hit.detail!.missing as string[]).length).toBeGreaterThan(0)
    expect(hit.description).toContain('代理指标')
    expect(hit.description).toContain('非 Google 官方排名因子')
    expect(hit.evidenceRefs).toEqual(['ep1'])
  })
  it('null when all signals present', () => {
    const html = '<article><span class="author">Jane</span><time datetime="2026-01-01">Jan</time><p>body</p></article><a href="/about">About</a>'
    expect(rule('C06').evaluate(withEntry(html))).toBeNull()
  })
  it('null without entryPage', () => {
    expect(rule('C06').evaluate(baseCtx())).toBeNull()
  })
})

describe('C07 GEO content features', () => {
  it('flags content lacking stats/citations/quotes', () => {
    const hit = asOne(rule('C07').evaluate(withEntry('<p>just some plain prose with no data</p>')))
    const missing = hit.detail!.missing as string[]
    expect(missing).toContain('statistics')
    expect(missing).toContain('citations')
    expect(missing).toContain('quotes')
  })
  it('null when all three present', () => {
    const html =
      '<p>Revenue grew 40% and 3 of 5 users, 99.9% uptime.</p>' +
      '<blockquote>An expert said this.</blockquote>' +
      '<a href="https://other.example/report">source</a>'
    expect(rule('C07').evaluate(withEntry(html))).toBeNull()
  })
  // 复发陷阱「域名带协议」：生产里 project.domain 是 normalizeDomain 输出的完整 URL（https://host/）。
  it('project.domain 为完整 URL 时，本站链接不算外链', () => {
    const ctx = withEntry(
      '<p>plain prose</p><a href="https://example.com/x">本站</a><a href="https://other.com/y">站外</a>',
    )
    ctx.project.domain = 'https://example.com/'
    const hit = asOne(rule('C07').evaluate(ctx))
    expect(hit.detail!.externalLinks).toBe(1)
  })
})

describe('C06/C07 让位给文章级规则（spec S4 §5；Review Focus 5）', () => {
  const articlePage = (url: string, isArticle: boolean) => ({
    url, discoveredVia: 'crawl', depth: 1, httpStatus: 200, finalUrl: null, canonicalUrl: null, metaRobots: null, mainTextChars: 500,
    inboundLinkCount: 1, checkStatus: 'checked', errorReason: null, isKeyPage: false,
    lightCheckExtra: {
      hasViewport: true, hreflangEntries: [], imgCount: 0, imgAltMissing: 0, listCount: 0, tableCount: 0, avgParagraphLen: 0, h2QuestionRate: 0,
      isHttps: true, mixedContentCount: 0, redirected: false,
      article: { isArticle, articleReasons: [], author: null, authorSource: null, authorUrl: null, datePublished: null, dateModified: null, mainWords: 500, stats: { total: 0, attributed: 0 }, citations: { total: 0, authoritative: 0 }, quotes: 0, tables: 0, hasReferencesSection: false },
    },
  })
  const withArticles = (n: number) => {
    const ctx = withEntry('<p>just some plain prose with no data</p>')
    ctx.siteAudit = { id: 'sa1', payload: { pages: Array.from({ length: n }, (_, i) => articlePage(`https://example.com/blog/${i}`, true)) } } as never
    return ctx
  }
  it('文章页 ≥ 3：只让出被 AR 规则接管的项——C06 保留关于/联系（无链接图时 TR06 不运行），C07 保留引述（第三轮独立审查 P2-12）', () => {
    const c06 = asOne(rule('C06').evaluate(withArticles(3)))
    expect(c06.detail).toMatchObject({ missing: ['about_contact'], supersededBy: ['AR01', 'AR03'] })
    const c07 = asOne(rule('C07').evaluate(withArticles(3)))
    expect(c07.detail).toMatchObject({ missing: ['quotes'], supersededBy: ['AR04', 'AR05'] })
  })
  it('文章页 ≥ 3 且有可用链接图（TR06 能运行）：C06 的关于/联系也让位', () => {
    const ctx = withArticles(3)
    const pages = (ctx.siteAudit!.payload as { pages: unknown[] }).pages
    ctx.siteAudit = { id: 'sa1', payload: { pages, linkGraph: buildLinkGraph({ entryUrl: 'https://example.com/', pages: [{ url: 'https://example.com/', checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'entry', contentKind: 'html', linkDetails: [{ url: 'https://example.com/blog/0', count: 1, anchors: [], regions: ['main'], nofollow: false }], externalLinks: [] }] }) } } as never
    expect(rule('C06').evaluate(ctx)).toBeNull()
  })
  it('文章页 < 3：C06/C07 照常按首页口径工作', () => {
    expect(rule('C06').evaluate(withArticles(2))).not.toBeNull()
    expect(rule('C07').evaluate(withArticles(2))).not.toBeNull()
  })
})

describe('C08 answer-first', () => {
  it('flags when front lacks self-contained answer', () => {
    const hit = asOne(rule('C08').evaluate(withEntry('<p>Welcome!</p><p>Hi</p><p>ok</p>')))
    expect(hit.title).toBe('答案未前置')
    expect(rule('C08').side).toBe('geo')
  })
  it('null when early paragraph answers directly', () => {
    const html = '<p>' + 'A CDN caches content near users to cut latency and speed page loads.'.padEnd(60, '.') + '</p><p>more</p><p>more2</p>'
    expect(rule('C08').evaluate(withEntry(html))).toBeNull()
  })
})

// 走真实轻检：fetchLightCheck（只假 fetch）产出 textHash / redirected / finalUrl，再按 collect-evidence 的落库映射组成页行。
async function crawled(url: string, html: string, finalUrl = url): Promise<SiteAuditPage> {
  const fetchImpl = (async () => {
    const res = new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    Object.defineProperty(res, 'url', { value: finalUrl })
    return res
  }) as unknown as typeof import('@/lib/security/safe-fetch').safeFetch
  const r = await fetchLightCheck(url, 'example.com', fetchImpl)
  return page({ url: r.url, finalUrl: r.finalUrl !== r.url ? r.finalUrl : null, contentHash: r.contentHash || null, lightCheckExtra: r.extra })
}
const body = (text: string, nonce: string, title: string) =>
  `<html><head><title>${title}</title><script nonce="${nonce}">window.x=1</script></head><body><main><p>${text}</p></main></body></html>`

describe('C10 正文文本完全相同（SP-A §5.2：按可见正文哈希，不按整页 HTML）', () => {
  it('正文相同、只是 nonce 与 title 不同 → 命中，描述写"正文文本完全相同"', async () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      await crawled('https://example.com/a', body('Same body text for both pages.', 'n1', 'A')),
      await crawled('https://example.com/b', body('Same body text for both pages.', 'n2', 'B')),
      await crawled('https://example.com/c', body('Different body text.', 'n3', 'C')),
    ])
    const hit = asOne(rule('C10').evaluate(ctx))
    expect(hit.scope).toBe('content:duplicate')
    expect(hit.description).toContain('正文文本完全相同')
    expect(hit.detail!.duplicateGroups).toBe(1)
    expect(hit.detail!.duplicatePageCount).toBe(2)
  })
  it('其中一页是跳转过去的（redirected）→ 不计入', async () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      await crawled('https://example.com/old', body('Same body text.', 'n1', 'A'), 'https://example.com/new'),
      await crawled('https://example.com/new', body('Same body text.', 'n2', 'A')),
    ])
    expect(ctx.siteAudit.payload.pages[0].lightCheckExtra?.redirected).toBe(true)
    expect(rule('C10').evaluate(ctx)).toBeNull()
  })
  it('跳转行一律不计入，即使跳转目标没被单独抓到（spec §5.2 #5：排除 redirected=true 的行）', async () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      await crawled('https://example.com/old', body('Same body text.', 'n1', 'A'), 'https://example.com/landing'),
      await crawled('https://example.com/other', body('Same body text.', 'n2', 'B')),
    ])
    expect(rule('C10').evaluate(ctx)).toBeNull()
  })
  it('两行最终 URL 相同（带跟踪参数 / www 的同一页）→ 只算一页', async () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      await crawled('https://example.com/a', body('Same body text.', 'n1', 'A')),
      await crawled('https://www.example.com/a/?utm_source=x', body('Same body text.', 'n2', 'A')),
    ])
    expect(ctx.siteAudit.payload.pages[1].finalUrl).toBe('https://example.com/a')
    expect(rule('C10').evaluate(ctx)).toBeNull()
  })
  it('旧数据没有 textHash（只有整页 contentHash）→ null', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ url: 'https://example.com/a', contentHash: 'h1' }), page({ url: 'https://example.com/b', contentHash: 'h1' })])
    expect(rule('C10').evaluate(ctx)).toBeNull()
  })
  it('null without siteAudit', () => {
    expect(rule('C10').evaluate(baseCtx())).toBeNull()
  })
})

const ext = (o: Partial<import('@/lib/crawl/light-check').LightCheckExtra> = {}) => ({
  hasViewport: true, hreflangEntries: [], imgCount: 0, imgAltMissing: 0, listCount: 1,
  tableCount: 0, avgParagraphLen: 50, h2QuestionRate: 0, isHttps: true, mixedContentCount: 0,
  redirected: false, ...o,
})

describe('C09 image alt', () => {
  it('flags high site-wide alt-missing ratio', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ url: 'https://example.com/a', lightCheckExtra: ext({ imgCount: 10, imgAltMissing: 6 }) })])
    const hit = asOne(rule('C09').evaluate(ctx))
    expect(hit.scope).toBe('site')
    expect(hit.detail!.missing).toBe(6)
  })
  it('null when ratio under threshold', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ lightCheckExtra: ext({ imgCount: 10, imgAltMissing: 1 }) })])
    expect(rule('C09').evaluate(ctx)).toBeNull()
  })
  it('null when no images', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ lightCheckExtra: ext({ imgCount: 0, imgAltMissing: 0 }) })])
    expect(rule('C09').evaluate(ctx)).toBeNull()
  })
})

describe('C11 scannability', () => {
  it('flags long-paragraph pages without lists/tables', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ url: 'https://example.com/wall', lightCheckExtra: ext({ listCount: 0, tableCount: 0, avgParagraphLen: 200 }) })])
    const hit = asOne(rule('C11').evaluate(ctx))
    expect(hit.detail!.count).toBe(1)
    expect(rule('C11').claimType).toBe('inferred')
  })
  it('null when a list is present', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ lightCheckExtra: ext({ listCount: 2, tableCount: 0, avgParagraphLen: 200 }) })])
    expect(rule('C11').evaluate(ctx)).toBeNull()
  })
  it('null when paragraphs are short', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ lightCheckExtra: ext({ listCount: 0, tableCount: 0, avgParagraphLen: 40 }) })])
    expect(rule('C11').evaluate(ctx)).toBeNull()
  })
})

describe('TA01 主题覆盖浅 / 话题群割裂', () => {
  it('命中：浅覆盖群 + 孤立群', () => {
    const ctx = baseCtx()
    // /blog 群 5 页但入度全 0（孤立）；/about 群 1 页（浅）
    const pages = [
      ...Array.from({ length: 5 }, (_, i) => page({ url: `https://example.com/blog/p${i}`, inboundLinkCount: 0 })),
      page({ url: 'https://example.com/about/x', inboundLinkCount: 8 }),
    ]
    ctx.siteAudit = audit(pages)
    const hit = rule('TA01').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.evidenceRefs).toEqual(['sa1'])
    const detail = hit.detail as { shallowClusters: unknown[]; isolatedClusters: unknown[] }
    // /about/x 是字面单页、不是话题模板，且无链接图无法确认抓取穷尽 → 不判浅（2026-10-03 噪音修复，见文件末尾用例）
    expect(detail.shallowClusters).toEqual([])
    expect(detail.isolatedClusters.length).toBeGreaterThanOrEqual(1) // /blog 入度 0
    expect(hit.description).toContain('非严格群内邻接')
  })

  it('语言路径群不计入话题群', () => {
    const ctx = baseCtx()
    // 只有 /de 语言群 1 页，应被排除 => 无话题群 => null
    ctx.siteAudit = audit([page({ url: 'https://example.com/de/p0', inboundLinkCount: 0 })])
    expect(rule('TA01').evaluate(ctx)).toBeNull()
  })

  it('深且互链的话题群不命中', () => {
    const ctx = baseCtx()
    const pages = Array.from({ length: 6 }, (_, i) =>
      page({ url: `https://example.com/guide/p${i}`, inboundLinkCount: 5 }),
    )
    ctx.siteAudit = audit(pages)
    expect(rule('TA01').evaluate(ctx)).toBeNull()
  })

  it('忠实群内邻接：高全站入度但群内零互链 → 判孤立（旧口径会漏）', () => {
    const ctx = baseCtx()
    // /blog 群 5 页，全站入度高（模拟全局导航），但彼此无群内边 => 群内入度均值 0 => 孤立
    const pages = Array.from({ length: 5 }, (_, i) =>
      page({ url: `https://example.com/blog/p${i}`, inboundLinkCount: 9, internalLinks: [] }),
    )
    ctx.siteAudit = audit(pages)
    const hit = rule('TA01').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    const detail = hit.detail as { isolatedClusters: unknown[] }
    expect(detail.isolatedClusters.length).toBeGreaterThanOrEqual(1)
    expect(hit.description).toContain('群内邻接')
    expect(hit.description).not.toContain('非严格群内邻接') // 忠实模式去掉近似免责
  })

  it('忠实群内邻接：成员互链充分 → 不判孤立', () => {
    const ctx = baseCtx()
    // 每页群内链向另 2 页 => 群内入度均值 2（>=1）=> 不孤立；6 页不浅 => null
    const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/guide/p${i}`)
    const pages = urls.map((url, i) =>
      page({ url, inboundLinkCount: 0, internalLinks: [urls[(i + 1) % 6], urls[(i + 2) % 6]] }),
    )
    ctx.siteAudit = audit(pages)
    expect(rule('TA01').evaluate(ctx)).toBeNull()
  })

  it('无 siteAudit 时 no-op', () => {
    const ctx = baseCtx()
    expect(rule('TA01').evaluate(ctx)).toBeNull()
  })
})

describe('TA02 话题群缺 Hub 页', () => {
  it('命中：大话题群无高入度中心页', () => {
    const ctx = baseCtx()
    // /docs 群 5 页，最高入度 3（<5）=> 缺 hub
    const pages = Array.from({ length: 5 }, (_, i) =>
      page({ url: `https://example.com/docs/p${i}`, inboundLinkCount: i === 0 ? 3 : 1 }),
    )
    ctx.siteAudit = audit(pages)
    const hit = rule('TA02').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.evidenceRefs).toEqual(['sa1'])
    const detail = hit.detail as { clustersWithoutHub: { pattern: string; maxInbound: number }[] }
    expect(detail.clustersWithoutHub[0].maxInbound).toBe(3)
  })

  it('有 Hub 页（高入度中心）不命中', () => {
    const ctx = baseCtx()
    const pages = Array.from({ length: 5 }, (_, i) =>
      page({ url: `https://example.com/docs/p${i}`, inboundLinkCount: i === 0 ? 9 : 1 }),
    )
    ctx.siteAudit = audit(pages)
    expect(rule('TA02').evaluate(ctx)).toBeNull()
  })

  it('小话题群（<4 页）跳过', () => {
    const ctx = baseCtx()
    const pages = Array.from({ length: 3 }, (_, i) =>
      page({ url: `https://example.com/docs/p${i}`, inboundLinkCount: 0 }),
    )
    ctx.siteAudit = audit(pages)
    expect(rule('TA02').evaluate(ctx)).toBeNull()
  })

  it('忠实群内邻接：高全站入度但群内无中心 → 判缺 Hub（旧口径会漏）', () => {
    const ctx = baseCtx()
    // 6 页全站入度高但群内零边 => 群内最大入度 0（<5）=> 缺 hub
    const pages = Array.from({ length: 6 }, (_, i) =>
      page({ url: `https://example.com/docs/p${i}`, inboundLinkCount: 9, internalLinks: [] }),
    )
    ctx.siteAudit = audit(pages)
    const hit = rule('TA02').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    const detail = hit.detail as { clustersWithoutHub: { maxInbound: number }[] }
    expect(detail.clustersWithoutHub[0].maxInbound).toBe(0)
  })

  it('忠实群内邻接：存在群内高入度中心页 → 不判缺 Hub', () => {
    const ctx = baseCtx()
    // p0 被其余 5 页群内链接 => 群内入度 5（>=5）=> 有 hub => null
    const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/docs/p${i}`)
    const pages = urls.map((url, i) =>
      page({ url, inboundLinkCount: 0, internalLinks: i === 0 ? [] : [urls[0]] }),
    )
    ctx.siteAudit = audit(pages)
    expect(rule('TA02').evaluate(ctx)).toBeNull()
  })

  it('无 siteAudit 时 no-op', () => {
    const ctx = baseCtx()
    expect(rule('TA02').evaluate(ctx)).toBeNull()
  })
})

describe('旧规则噪音修复（2026-10-03 真实站点核验：metadocu/jac/troyhunt/ruanyifeng）', () => {
  const H = 'https://example.com'
  const art = (isArticle: boolean) => ({
    isArticle, articleReasons: [], author: null, authorSource: null, authorUrl: null, datePublished: null, dateModified: null, mainWords: 500,
    stats: { total: 0, attributed: 0 }, citations: { total: 0, authoritative: 0 }, quotes: 0, tables: 0, hasReferencesSection: false,
  })
  // 站点页 → 真实 buildLinkGraph（链接取 internalLinks；全部为已抓 HTML，抓取穷尽）
  const withGraph = (pages: SiteAuditPage[]) => {
    const a = audit(pages)
    a.payload.linkGraph = buildLinkGraph({
      entryUrl: `${H}/`,
      pages: pages.map((p) => ({
        url: p.url, finalUrl: p.finalUrl, checkStatus: p.checkStatus, httpStatus: p.httpStatus, metaRobots: null, discoveredVia: p.discoveredVia,
        contentKind: p.lightCheckExtra?.contentKind ?? 'html',
        linkDetails: (p.internalLinks ?? []).map((url) => ({ url, count: 1, anchors: [], regions: ['main' as const], nofollow: false })),
        externalLinks: [],
      })),
    })
    return a
  }

  describe('C02：多个 meta description 标签', () => {
    it('首个为空、另有非空（troyhunt 主题重复输出）→ 不报「缺少」，报重复标签（notice）', () => {
      const hit = asOne(rule('C02').evaluate(withEntry('<meta name="description" content=""><meta name="description" content="Hi, I write this blog">')))
      expect([hit.title, hit.severity, hit.detail]).toEqual(['入口页存在重复的 meta description 标签', 'notice', { tags: 2, empty: 1 }])
    })
    it('只有空标签 → 仍报缺少，并说明标签存在但内容为空', () => {
      const hit = asOne(rule('C02').evaluate(withEntry('<meta name="description" content="  ">')))
      expect(hit.title).toBe('入口页缺少 meta description')
      expect(hit.description).toContain('内容为空')
    })
    it('name 大小写不敏感', () => {
      expect(rule('C02').evaluate(withEntry('<meta name="Description" content="hello">'))).toBeNull()
    })
  })

  describe('C05a：嵌套类型与子类型', () => {
    it('Organization 嵌套在 WebSite.publisher 里（troyhunt）→ 不报缺推荐类型', () => {
      const ctx = baseCtx()
      ctx.schemas = [schema({ types: ['WebSite'], raw: [{ '@type': 'WebSite', publisher: { '@type': 'Organization', name: 'Troy' } }] })]
      expect(rule('C05a').evaluate(ctx)).toBeNull()
    })
    it('BlogPosting / LocalBusiness 等子类型算推荐类型', () => {
      for (const t of ['BlogPosting', 'NewsArticle', 'LocalBusiness', 'Corporation']) {
        const ctx = baseCtx()
        ctx.schemas = [schema({ types: [t] })]
        expect(rule('C05a').evaluate(ctx)).toBeNull()
      }
    })
  })

  describe('C06：作者/日期只对「入口页本身是文章」才要求', () => {
    const entryCtx = (isArticle: boolean) => {
      const ctx = withEntry('<title>Tool</title><h1>Clean metadata</h1><a href="/about">About</a>')
      ctx.siteAudit = audit([page({ url: `${H}/`, discoveredVia: 'entry', lightCheckExtra: { ...ext(), contentKind: 'html', article: art(isArticle) } })])
      return ctx
    }
    it('工具/企业首页（非文章）有关于入口 → 不报（metadocu）', () => {
      expect(rule('C06').evaluate(entryCtx(false))).toBeNull()
    })
    it('入口页就是文章 → 仍要求作者与日期', () => {
      expect(asOne(rule('C06').evaluate(entryCtx(true))).detail).toMatchObject({ missing: ['author', 'date'] })
    })
  })

  describe('C09：只按内容图片计 alt 缺失', () => {
    it('每页只有页眉里的装饰 logo（alt=""）→ 不报（metadocu「100% 缺失」）', () => {
      const ctx = baseCtx()
      ctx.siteAudit = audit(Array.from({ length: 21 }, (_, i) => page({ url: `${H}/p${i}`, lightCheckExtra: ext({ imgCount: 1, imgAltMissing: 1, contentImgCount: 0, contentImgAltMissing: 0 }) })))
      expect(rule('C09').evaluate(ctx)).toBeNull()
    })
    it('正文配图缺 alt → 按内容图片口径报', () => {
      const ctx = baseCtx()
      ctx.siteAudit = audit([page({ url: `${H}/a`, lightCheckExtra: ext({ imgCount: 12, imgAltMissing: 9, contentImgCount: 10, contentImgAltMissing: 8 }) })])
      expect(asOne(rule('C09').evaluate(ctx)).detail).toMatchObject({ imgs: 10, missing: 8 })
    })
  })

  describe('TA01/TA02：话题群只由内容页组成', () => {
    const noisePages = () => [
      page({ url: `${H}/`, discoveredVia: 'entry', internalLinks: [`${H}/about`] }),
      page({ url: `${H}/about`, internalLinks: [] }), // 单页字面路径不是话题群
      ...[1, 2, 3, 4, 5].map((i) => page({ url: `${H}/u/cms/${i}.pdf`, internalLinks: null, lightCheckExtra: ext({ contentKind: 'document' }) })),
      ...[1, 2, 3, 4, 5].map((i) => page({ url: `${H}/old/${i}`, finalUrl: `${H}/new-${i}`, internalLinks: [] })), // 跳转源
      ...['a', 'b', 'c', 'd', 'e'].map((s) => page({ url: `${H}/tag/${s}`, internalLinks: [] })), // 标签归档
      ...[2, 3, 4].map((i) => page({ url: `${H}/page/${i}`, internalLinks: [] })), // 分页
      ...[1, 2, 3, 4].map((i) => page({ url: `${H}/limited/${i}`, httpStatus: 429, internalLinks: null })),
    ]
    it('首页、单页、PDF、跳转源、标签/分页、错误页都不成群 → TA01/TA02 不报', () => {
      const ctx = baseCtx()
      ctx.siteAudit = audit(noisePages())
      expect([rule('TA01').evaluate(ctx), rule('TA02').evaluate(ctx)]).toEqual([null, null])
    })
    it('「浅」只认 URL 模板群（含 {id}/{slug} 等占位），且须抓取穷尽；未穷尽时样本少不代表话题浅', () => {
      const pages = [
        page({ url: `${H}/`, discoveredVia: 'entry', internalLinks: [`${H}/news/1`, `${H}/news/2`] }),
        page({ url: `${H}/news/1`, internalLinks: [`${H}/news/2`] }),
        page({ url: `${H}/news/2`, internalLinks: [`${H}/news/1`] }),
      ]
      const ctx = baseCtx()
      ctx.siteAudit = withGraph(pages)
      expect((rule('TA01').evaluate(ctx) as RuleHitDraft).detail).toMatchObject({ shallowClusters: [{ pattern: '/news/{id}', pageCount: 2 }], isolatedClusters: [] })
      ctx.siteAudit = audit(pages) // 无链接图（无法确认穷尽）
      expect(rule('TA01').evaluate(ctx)).toBeNull()
    })
    it('「孤立」至少 3 页才判（1–2 页的群内邻接天然为 0）', () => {
      const ctx = baseCtx()
      ctx.siteAudit = audit([page({ url: `${H}/news/1`, internalLinks: [] }), page({ url: `${H}/news/2`, internalLinks: [] })])
      expect(rule('TA01').evaluate(ctx)).toBeNull()
    })
    it('TA02：上级栏目页（/news 列表）被群内成员普遍链接即为 Hub（jac 新闻群）', () => {
      const members = Array.from({ length: 6 }, (_, i) => `${H}/news/${2026}0${i + 1}/${100 + i}.html`)
      const ctx = baseCtx()
      ctx.siteAudit = audit([
        page({ url: `${H}/news`, internalLinks: members }),
        ...members.map((url) => page({ url, internalLinks: [`${H}/news`] })),
      ])
      expect(rule('TA02').evaluate(ctx)).toBeNull()
    })
  })
})
