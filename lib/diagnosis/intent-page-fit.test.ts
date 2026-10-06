import { describe, it, expect } from 'vitest'
import type { SiteAuditPage, SiteAuditPayload } from '@/lib/crawl/site-audit'
import type { RuleContext } from './types'
import { buildIntentPageFitArtifactPayload, buildIntentPageFitMap, classifyPageRole, classifyQueryIntent } from './intent-page-fit'

const page = (over: Partial<SiteAuditPage>): SiteAuditPage => ({
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
  ...over,
})

const audit = (pages: SiteAuditPage[]): { id: string; payload: SiteAuditPayload } => ({
  id: 'sa1',
  payload: {
    protocol: { maxPages: 100, maxDepth: 3 },
    stats: {
      totalDiscovered: pages.length,
      checked: pages.length,
      truncated: 0,
      http4xx: 0,
      http5xx: 0,
      errors: 0,
      blockedByRobots: 0,
      noindex: 0,
      canonicalOffsite: 0,
      orphanPages: 0,
      citedPages: 0,
    },
    pages,
    templates: [],
    citations: [],
  },
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

const qpm = (over: Partial<RuleContext['queryPageMetrics'][number]>): RuleContext['queryPageMetrics'][number] => ({
  evidenceId: 'gsc_qp',
  page: 'https://example.com/',
  query: 'crm pricing',
  clicks: 0,
  impressions: 100,
  position: 8,
  ...over,
})

describe('intent-page-fit classifiers', () => {
  it('classifies query intent with support/comparison before provider intent', () => {
    expect(classifyQueryIntent('best crm alternatives', 'informational')).toBe('comparison')
    expect(classifyQueryIntent('api setup error')).toBe('support')
    expect(classifyQueryIntent('crm pricing')).toBe('transactional')
  })

  it('keeps container page roles stable', () => {
    expect(classifyPageRole('https://example.com/blog/pricing-guide')).toBe('blog')
    expect(classifyPageRole('https://example.com/docs/api-reference')).toBe('docs')
    expect(classifyPageRole('https://example.com/pricing')).toBe('pricing')
  })
})

describe('buildIntentPageFitMap', () => {
  it('flags a transactional query served by a blog page as a mismatch', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      page({ url: 'https://example.com/blog/pricing-guide', title: 'CRM pricing guide', inboundLinkCount: 5 }),
    ])
    ctx.queryPageMetrics = [
      qpm({ query: 'crm pricing', page: 'https://example.com/blog/pricing-guide', impressions: 240, position: 7 }),
    ]
    const row = buildIntentPageFitMap(ctx).rows[0]
    expect(row.intent).toBe('transactional')
    expect(row.primaryPage?.role).toBe('blog')
    expect(row.issueCodes).toContain('intent_page_mismatch')
    expect(row.fitScore).toBeLessThan(50)
  })

  it('detects overbroad pages that carry multiple search intents', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      page({ url: 'https://example.com/', title: 'Example' }),
    ])
    ctx.queryPageMetrics = [
      qpm({ query: 'crm pricing', page: 'https://example.com/', impressions: 200 }),
      qpm({ query: 'how to setup crm', page: 'https://example.com/', impressions: 120 }),
      qpm({ query: 'best crm alternatives', page: 'https://example.com/', impressions: 90 }),
    ]
    const fit = buildIntentPageFitMap(ctx)
    expect(fit.overbroadPages).toHaveLength(1)
    expect(fit.overbroadPages[0].queryCount).toBe(3)
    expect(fit.rows.every((row) => row.issueCodes.includes('overbroad_landing_page'))).toBe(true)
  })

  it('flags matching landing pages with weak internal link support', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      page({ url: 'https://example.com/services/seo', title: 'SEO services', inboundLinkCount: 0 }),
    ])
    ctx.queryPageMetrics = [
      qpm({ query: 'seo services', page: 'https://example.com/services/seo', impressions: 180 }),
    ]
    const row = buildIntentPageFitMap(ctx).rows[0]
    expect(row.primaryPage?.role).toBe('service')
    expect(row.issueCodes).toContain('underlinked_landing_page')
    expect(row.issueCodes).not.toContain('intent_page_mismatch')
  })

  it('flags demand with no ranking or crawled candidate page as missing', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      page({ url: 'https://example.com/about', title: 'About Example' }),
    ])
    ctx.dataforseo.serpByKeyword = [
      {
        keyword: 'enterprise crm pricing',
        items: [{ domain: 'competitor.com', url: 'https://competitor.com/pricing', rank: 1 }],
        evidenceId: 'serp1',
      },
    ]
    ctx.dataforseo.keywordData = [
      { keyword: 'enterprise crm pricing', searchVolume: 700, difficulty: 35, cpc: 8, intent: 'transactional', evidenceId: 'labs1' },
    ]
    const row = buildIntentPageFitMap(ctx).rows[0]
    expect(row.primaryPage).toBeNull()
    expect(row.issueCodes).toContain('missing_landing_page')
    expect(row.evidenceIds).toEqual(['serp1', 'labs1'])
  })

  it('summarizes issue rows into a bounded workflow artifact payload', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit([
      page({ url: 'https://example.com/blog/pricing-guide', title: 'CRM pricing guide', inboundLinkCount: 0 }),
      page({ url: 'https://example.com/services/seo', title: 'SEO services', inboundLinkCount: 0 }),
    ])
    ctx.queryPageMetrics = [
      qpm({ query: 'crm pricing', page: 'https://example.com/blog/pricing-guide', impressions: 240, evidenceId: 'gsc_blog' }),
      qpm({ query: 'seo services', page: 'https://example.com/services/seo', impressions: 180, evidenceId: 'gsc_service' }),
    ]

    const payload = buildIntentPageFitArtifactPayload(buildIntentPageFitMap(ctx), { rowLimit: 1 })

    expect(payload.kind).toBe('intent_page_fit_map')
    expect(payload.rowCount).toBe(2)
    expect(payload.issueRowCount).toBe(2)
    expect(payload.issueCounts.intent_page_mismatch).toBe(1)
    expect(payload.issueCounts.underlinked_landing_page).toBeGreaterThanOrEqual(1)
    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({
      query: 'crm pricing',
      currentUrl: 'https://example.com/blog/pricing-guide',
      action: 'reshape_landing_page',
      evidenceIds: ['gsc_blog'],
    })
  })
})
