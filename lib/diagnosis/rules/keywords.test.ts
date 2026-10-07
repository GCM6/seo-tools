import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
import type { SiteAuditPage, SiteAuditPayload } from '@/lib/crawl/site-audit'
import { keywordRules } from './keywords'

const rule = (id: string) => keywordRules.find((r) => r.id === id)!

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

const km = (o: Partial<RuleContext['keywordMetrics'][number]>): RuleContext['keywordMetrics'][number] => ({
  evidenceId: 'gsc1', dimension: 'query', keyText: 'kw', clicks: 0, impressions: 0, ctr: 0, position: 0, ...o,
})

const qpm = (o: Partial<RuleContext['queryPageMetrics'][number]>): RuleContext['queryPageMetrics'][number] => ({
  evidenceId: 'gsc2', page: 'https://example.com/a', query: 'q', clicks: 0, impressions: 0, position: 0, ...o,
})

const gap = (o: Partial<RuleContext['keywordGaps'][number]>): RuleContext['keywordGaps'][number] => ({
  keyword: 'kw', gapType: 'missing', ourPosition: null, opportunityScore: null, searchVolume: null, evidenceId: 'gap1', ...o,
})

const page = (p: Partial<SiteAuditPage>): SiteAuditPage => ({
  url: 'https://example.com/',
  discoveredVia: 'crawl',
  depth: 1,
  httpStatus: 200,
  finalUrl: null,
  title: null,
  canonicalUrl: null,
  metaRobots: null,
  mainTextChars: 900,
  inboundLinkCount: 5,
  checkStatus: 'checked',
  errorReason: null,
  isKeyPage: false,
  ...p,
})

const audit = (pages: SiteAuditPage[]): { id: string; payload: SiteAuditPayload } => ({
  id: 'sa1',
  payload: {
    protocol: { maxPages: 100, maxDepth: 3 },
    stats: {
      totalDiscovered: pages.length, checked: pages.length, truncated: 0, http4xx: 0, http5xx: 0,
      errors: 0, blockedByRobots: 0, noindex: 0, canonicalOffsite: 0, orphanPages: 0, citedPages: 0,
    },
    pages,
    templates: [],
    citations: [],
  },
})

describe('K01 opportunity keywords', () => {
  it('flags position 4-20 with high impressions', () => {
    const ctx = baseCtx()
    ctx.keywordMetrics = [
      km({ keyText: 'winnable', position: 8, impressions: 500 }),
      km({ keyText: 'toolow', position: 3, impressions: 500 }), // 已在前 3，非机会
      km({ keyText: 'toodeep', position: 25, impressions: 500 }), // 太靠后
      km({ keyText: 'noimpr', position: 8, impressions: 5 }), // 展示不足
    ]
    const hit = rule('K01').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    const kws = hit.detail!.keywords as { text: string }[]
    expect(kws.map((k) => k.text)).toEqual(['winnable'])
    expect(hit.evidenceRefs).toEqual(['gsc1'])
  })
  it('null when no query metrics', () => {
    expect(rule('K01').evaluate(baseCtx())).toBeNull()
  })
})

describe('K02 low CTR anomaly', () => {
  it('flags top-5 rank with CTR under half the positional benchmark; stays hypothesis', () => {
    const ctx = baseCtx()
    ctx.keywordMetrics = [
      km({ keyText: 'suppressed', position: 2, impressions: 1000, ctr: 0.05 }), // bench 0.15，0.05 < 0.075
      km({ keyText: 'healthy', position: 2, impressions: 1000, ctr: 0.14 }), // 正常
    ]
    const hit = rule('K02').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('K02').claimType).toBe('hypothesis')
    const kws = hit.detail!.keywords as { text: string }[]
    expect(kws.map((k) => k.text)).toEqual(['suppressed'])
  })
  it('null when CTR near benchmark', () => {
    const ctx = baseCtx()
    ctx.keywordMetrics = [km({ position: 1, impressions: 500, ctr: 0.2 })]
    expect(rule('K02').evaluate(ctx)).toBeNull()
  })
})

describe('K06 cannibalization', () => {
  it('flags a query ranking on two pages', () => {
    const ctx = baseCtx()
    ctx.queryPageMetrics = [
      qpm({ query: 'widgets', page: 'https://example.com/a', impressions: 100, position: 5 }),
      qpm({ query: 'widgets', page: 'https://example.com/b', impressions: 50, position: 9 }),
      qpm({ query: 'solo', page: 'https://example.com/c', impressions: 80, position: 4 }),
    ]
    const hit = rule('K06').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    const queries = hit.detail!.queries as { query: string; pageCount: number }[]
    expect(queries).toHaveLength(1)
    expect(queries[0].query).toBe('widgets')
    expect(queries[0].pageCount).toBe(2)
  })
  it('ignores low-impression pages below noise floor', () => {
    const ctx = baseCtx()
    ctx.queryPageMetrics = [
      qpm({ query: 'q', page: 'https://example.com/a', impressions: 100 }),
      qpm({ query: 'q', page: 'https://example.com/b', impressions: 3 }), // 噪声，滤掉
    ]
    expect(rule('K06').evaluate(ctx)).toBeNull()
  })
})

describe('K03 gap keywords (missing)', () => {
  it('flags missing gaps sorted by opportunityScore, measured_sample', () => {
    const ctx = baseCtx()
    ctx.keywordGaps = [
      gap({ keyword: 'low', gapType: 'missing', opportunityScore: 10, evidenceId: 'g1' }),
      gap({ keyword: 'high', gapType: 'missing', opportunityScore: 90, evidenceId: 'g2' }),
      gap({ keyword: 'weakone', gapType: 'weak', opportunityScore: 99, evidenceId: 'g3' }), // 非 missing
    ]
    const hit = rule('K03').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('K03').claimType).toBe('measured_sample')
    const kws = hit.detail!.keywords as { text: string }[]
    expect(kws.map((k) => k.text)).toEqual(['high', 'low'])
    expect(hit.evidenceRefs).toEqual(['g2', 'g1'])
  })
  it('null when no gaps', () => {
    expect(rule('K03').evaluate(baseCtx())).toBeNull()
  })
})

describe('K04 gap keywords (weak)', () => {
  it('flags weak gaps only', () => {
    const ctx = baseCtx()
    ctx.keywordGaps = [
      gap({ keyword: 'weakkw', gapType: 'weak', ourPosition: 18, opportunityScore: 50, evidenceId: 'g5' }),
      gap({ keyword: 'missingkw', gapType: 'missing', opportunityScore: 80, evidenceId: 'g6' }),
    ]
    const hit = rule('K04').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    const kws = hit.detail!.keywords as { text: string }[]
    expect(kws.map((k) => k.text)).toEqual(['weakkw'])
    expect(hit.evidenceRefs).toEqual(['g5'])
  })
  it('null when no weak gaps', () => {
    const ctx = baseCtx()
    ctx.keywordGaps = [gap({ gapType: 'missing' })]
    expect(rule('K04').evaluate(ctx)).toBeNull()
  })
})

describe('K05 brand SERP coverage', () => {
  it('flags when own domain absent from brand SERP', () => {
    const ctx = baseCtx()
    ctx.dataforseo.brandSerp = {
      brandQuery: 'example brand', hasKnowledgePanel: true, ownDomainPresent: false,
      items: [{ domain: 'directory.com', url: 'https://directory.com/x', rank: 1 }], evidenceId: 'bs1',
    }
    const hit = rule('K05').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('K05').claimType).toBe('measured_sample')
    expect(hit.evidenceRefs).toEqual(['bs1'])
  })
  it('flags when top position held by third party even if present', () => {
    const ctx = baseCtx()
    ctx.dataforseo.brandSerp = {
      brandQuery: 'example', hasKnowledgePanel: true, ownDomainPresent: true,
      items: [
        { domain: 'competitor.com', url: 'https://competitor.com', rank: 1 },
        { domain: 'example.com', url: 'https://example.com', rank: 2 },
      ], evidenceId: 'bs2',
    }
    const hit = rule('K05').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect((hit.detail!.reason as string)).toBe('top_third_party')
  })
  it('null when own domain holds top position', () => {
    const ctx = baseCtx()
    ctx.dataforseo.brandSerp = {
      brandQuery: 'example', hasKnowledgePanel: true, ownDomainPresent: true,
      items: [{ domain: 'www.example.com', url: 'https://example.com', rank: 1 }], evidenceId: 'bs3',
    }
    expect(rule('K05').evaluate(ctx)).toBeNull()
  })
  it('null when no brandSerp evidence', () => {
    expect(rule('K05').evaluate(baseCtx())).toBeNull()
  })
})

describe('K07 intent mismatch', () => {
  it('flags transactional-intent keyword served by a blog page; inferred', () => {
    const ctx = baseCtx()
    ctx.dataforseo.serpByKeyword = [
      { keyword: 'buy widgets', items: [{ domain: 'example.com', url: 'https://example.com/blog/how-to', rank: 6 }], evidenceId: 'serp1' },
    ]
    ctx.dataforseo.keywordData = [
      { keyword: 'buy widgets', searchVolume: 500, difficulty: 30, cpc: 2, intent: 'transactional', evidenceId: 'kd1' },
    ]
    const hit = rule('K07').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('K07').claimType).toBe('inferred')
    expect(hit.evidenceRefs).toEqual(['serp1'])
    const kws = hit.detail!.keywords as { text: string; ourPageType: string; expectedPageType: string }[]
    expect(kws[0].ourPageType).toBe('informational')
    expect(kws[0].expectedPageType).toBe('transactional')
  })
  it('null when page type matches intent', () => {
    const ctx = baseCtx()
    ctx.dataforseo.serpByKeyword = [
      { keyword: 'buy widgets', items: [{ domain: 'example.com', url: 'https://example.com/product/widgets', rank: 6 }], evidenceId: 'serp1' },
    ]
    ctx.dataforseo.keywordData = [
      { keyword: 'buy widgets', searchVolume: 500, difficulty: 30, cpc: 2, intent: 'transactional', evidenceId: 'kd1' },
    ]
    expect(rule('K07').evaluate(ctx)).toBeNull()
  })
  it('null when own domain does not rank for the keyword', () => {
    const ctx = baseCtx()
    ctx.dataforseo.serpByKeyword = [
      { keyword: 'buy widgets', items: [{ domain: 'other.com', url: 'https://other.com/blog', rank: 1 }], evidenceId: 'serp1' },
    ]
    ctx.dataforseo.keywordData = [
      { keyword: 'buy widgets', searchVolume: 500, difficulty: 30, cpc: 2, intent: 'transactional', evidenceId: 'kd1' },
    ]
    expect(rule('K07').evaluate(ctx)).toBeNull()
  })
})

describe('IPF Intent-to-Page Fit rules', () => {
  it('IPF01 flags demand with no clear landing page', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ url: 'https://example.com/about', title: 'About Example' })])
    ctx.dataforseo.serpByKeyword = [
      { keyword: 'enterprise crm pricing', items: [{ domain: 'competitor.com', url: 'https://competitor.com/pricing', rank: 1 }], evidenceId: 'serp1' },
    ]
    ctx.dataforseo.keywordData = [
      { keyword: 'enterprise crm pricing', searchVolume: 700, difficulty: 35, cpc: 8, intent: 'transactional', evidenceId: 'labs1' },
    ]
    const hit = rule('IPF01').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(hit.evidenceRefs).toEqual(['serp1', 'labs1'])
    const kws = hit.detail!.keywords as { text: string; currentUrl: string | null }[]
    expect(kws[0]).toMatchObject({ text: 'enterprise crm pricing', currentUrl: null })
  })

  it('IPF02 flags GSC intent-page mismatch', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      page({ url: 'https://example.com/blog/pricing-guide', title: 'CRM pricing guide' }),
    ])
    ctx.queryPageMetrics = [
      qpm({ query: 'crm pricing', page: 'https://example.com/blog/pricing-guide', impressions: 240, position: 7 }),
    ]
    const hit = rule('IPF02').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    const kws = hit.detail!.keywords as { currentPageRole: string; intent: string }[]
    expect(kws[0]).toMatchObject({ currentPageRole: 'blog', intent: 'transactional' })
  })

  it('IPF03 flags overbroad pages carrying multiple intents', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([page({ url: 'https://example.com/', title: 'Example' })])
    ctx.queryPageMetrics = [
      qpm({ query: 'crm pricing', page: 'https://example.com/', impressions: 200 }),
      qpm({ query: 'how to setup crm', page: 'https://example.com/', impressions: 120 }),
      qpm({ query: 'best crm alternatives', page: 'https://example.com/', impressions: 90 }),
    ]
    const hit = rule('IPF03').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    const pages = hit.detail!.pages as { url: string; queryCount: number }[]
    expect(pages[0]).toMatchObject({ url: 'https://example.com/', queryCount: 3 })
  })

  it('IPF04 flags matching landing pages with weak inbound links', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      page({ url: 'https://example.com/services/seo', title: 'SEO services', inboundLinkCount: 0 }),
    ])
    ctx.queryPageMetrics = [
      qpm({ query: 'seo services', page: 'https://example.com/services/seo', impressions: 180 }),
    ]
    const hit = rule('IPF04').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    const kws = hit.detail!.keywords as { currentUrl: string; currentPageRole: string }[]
    expect(kws[0]).toMatchObject({ currentUrl: 'https://example.com/services/seo', currentPageRole: 'service' })
  })
})

describe('K05 按自然排名判断品牌词首位（验收新发现 3：竞品在品牌词投广告不等于"首位被第三方占位"）', () => {
  it('竞品广告占绝对第 1、官网是自然第 1 → 不报', async () => {
    const { buildRuleContext } = await import('../context')
    const ctx = buildRuleContext({
      project: { domain: 'https://example.com/', industry: 'tool', market: 'global-en', language: 'en', competitors: [] },
      evidence: [{
        id: 'ev_bs', type: 'dataforseo_serp', claimLevel: 'L3', source: 'example.com', sitePageId: null, rawText: '',
        payload: {
          kind: 'brand_serp', engine: 'google', brandQuery: 'example', hasKnowledgePanel: false, ownDomainPresent: true,
          items: [
            { domain: 'competitor.com', url: 'https://competitor.com/lp', rank: 1, rankGroup: 1, type: 'paid' },
            { domain: 'example.com', url: 'https://example.com/', rank: 2, rankGroup: 1, type: 'organic' },
          ],
        },
      }],
      probe: null,
    })
    expect(rule('K05').evaluate(ctx)).toBeNull()
  })
})
