import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
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
