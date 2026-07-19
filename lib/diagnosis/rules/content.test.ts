import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
import type { SiteAuditPage, SiteAuditPayload, SiteAuditTemplate } from '@/lib/crawl/site-audit'
import { contentRules } from './content'

const rule = (id: string) => contentRules.find((r) => r.id === id)!

const asOne = (r: RuleHitDraft | RuleHitDraft[] | null) => (Array.isArray(r) ? r[0] : r) as RuleHitDraft
const asArr = (r: RuleHitDraft | RuleHitDraft[] | null) => (Array.isArray(r) ? r : r ? [r] : []) as RuleHitDraft[]

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
    expect(hit.title).toBe('入口页 H1 与 title 完全重复')
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

describe('C05c required fields', () => {
  it('flags missing Product required (image)', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ id: 'scP', raw: [{ '@context': 'https://schema.org', '@type': 'Product', name: 'Widget' }] })]
    const hit = asOne(rule('C05c').evaluate(ctx))
    expect(hit.scope).toBe('schema:required')
    expect(hit.evidenceRefs).toEqual(['scP'])
    const missing = hit.detail!.missing as { missingFields: string[] }[]
    expect(missing[0].missingFields).toContain('image')
  })
  it('ignores deprecated FAQPage (not in vocab)', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ raw: [{ '@context': 'https://schema.org', '@type': 'FAQPage' }] })]
    expect(rule('C05c').evaluate(ctx)).toBeNull()
  })
  it('null when required fields present', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ raw: [{ '@context': 'https://schema.org', '@type': 'Product', name: 'x', image: 'https://example.com/a.jpg' }] })]
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

describe('C10 exact duplicate content', () => {
  it('flags pages sharing a contentHash', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      page({ url: 'https://example.com/a', contentHash: 'h1' }),
      page({ url: 'https://example.com/b', contentHash: 'h1' }),
      page({ url: 'https://example.com/c', contentHash: 'h2' }),
    ])
    const hit = asOne(rule('C10').evaluate(ctx))
    expect(hit.scope).toBe('content:duplicate')
    expect(hit.detail!.duplicateGroups).toBe(1)
    expect(hit.detail!.duplicatePageCount).toBe(2)
  })
  it('null when no shared hashes', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ url: 'https://example.com/a', contentHash: 'h1' }), page({ url: 'https://example.com/b', contentHash: 'h2' })])
    expect(rule('C10').evaluate(ctx)).toBeNull()
  })
  it('ignores null contentHash', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ url: 'https://example.com/a', contentHash: null }), page({ url: 'https://example.com/b', contentHash: null })])
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
    expect(detail.shallowClusters.length).toBeGreaterThanOrEqual(1) // /about 1 页
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
