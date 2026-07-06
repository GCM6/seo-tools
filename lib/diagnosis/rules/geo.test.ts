import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
import type { ProbeSummary } from '@/lib/probes/summary'
import { geoRules } from './geo'

const rule = (id: string) => geoRules.find((r) => r.id === id)!

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
})

const probe = (promptsPresent: number, promptsTotal = 5): ProbeSummary => ({
  promptsTotal,
  promptsPresent,
  totalSamples: promptsTotal,
  perPrompt: [],
  sov: [],
  perEngine: [],
  sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 },
  sampleEvidenceId: 'ev',
})

describe('G03 render dependency (GEO framing)', () => {
  it('hits same render-dependent pages as T10', () => {
    const ctx = baseCtx()
    ctx.renderChecks = [
      { id: 'rc1', source: 'https://example.com/a', sitePageId: null, initialChars: 50, renderedChars: 1000, delta: 950, renderedText: '' },
    ]
    const hits = rule('G03').evaluate(ctx) as RuleHitDraft[]
    expect(hits[0].evidenceRefs).toEqual(['rc1'])
    expect(hits[0].description).toContain('AI 抓取链路不可见')
  })
  it('null when no render dependency', () => {
    expect(rule('G03').evaluate(baseCtx())).toBeNull()
  })
})

describe('G05 low AI visibility', () => {
  it('hits when ratio < 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = probe(1) // 1/5 = 0.2
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G05').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['pe1'])
    expect(hit.detail!.directional).toBe(true)
  })
  it('null when ratio >= 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = probe(2) // 2/5 = 0.4
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G05').evaluate(ctx)).toBeNull()
  })
  it('null when no probe evidence', () => {
    const ctx = baseCtx()
    ctx.probe = probe(1)
    ctx.probeEvidenceId = null
    expect(rule('G05').evaluate(ctx)).toBeNull()
  })
})

describe('G06 zero citation', () => {
  it('hits when promptsPresent === 0', () => {
    const ctx = baseCtx()
    ctx.probe = probe(0)
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G06').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['pe1'])
  })
  it('null when brand present at least once', () => {
    const ctx = baseCtx()
    ctx.probe = probe(1)
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G06').evaluate(ctx)).toBeNull()
  })
})

const entry = (): RuleContext['entryPage'] => ({
  id: 'ep1',
  rawHtml: '',
  canonicalUrl: null,
  metaRobots: null,
  robotsAllowed: true,
})

describe('G01 AI crawler blocked by robots', () => {
  it('error when a search crawler is disallowed', () => {
    const ctx = baseCtx()
    ctx.entryPage = entry()
    ctx.robotsText = 'User-agent: PerplexityBot\nDisallow: /'
    const hits = rule('G01').evaluate(ctx) as RuleHitDraft[]
    const err = hits.find((h) => h.severity === 'error')!
    expect(err).toBeTruthy()
    expect(err.evidenceRefs).toEqual(['ep1'])
    expect(err.scope).toBe('geo:robots')
    expect(err.detail!.blocked as string[]).toContain('PerplexityBot')
  })
  it('only a notice when a training crawler is disallowed', () => {
    const ctx = baseCtx()
    ctx.entryPage = entry()
    ctx.robotsText = 'User-agent: GPTBot\nDisallow: /'
    const hits = rule('G01').evaluate(ctx) as RuleHitDraft[]
    expect(hits).toHaveLength(1)
    expect(hits[0].severity).toBe('notice')
    expect(hits[0].detail!.blocked as string[]).toContain('GPTBot')
  })
  it('emits both an error and a notice when both kinds blocked', () => {
    const ctx = baseCtx()
    ctx.entryPage = entry()
    ctx.robotsText = 'User-agent: *\nDisallow: /'
    const hits = rule('G01').evaluate(ctx) as RuleHitDraft[]
    expect(hits.some((h) => h.severity === 'error')).toBe(true)
    expect(hits.some((h) => h.severity === 'notice')).toBe(true)
  })
  it('null when all crawlers allowed', () => {
    const ctx = baseCtx()
    ctx.entryPage = entry()
    ctx.robotsText = 'User-agent: *\nDisallow: /private'
    expect(rule('G01').evaluate(ctx)).toBeNull()
  })
  it('null when robotsText empty or missing entry page', () => {
    const ctx = baseCtx()
    ctx.robotsText = null
    ctx.entryPage = entry()
    expect(rule('G01').evaluate(ctx)).toBeNull()
    const ctx2 = baseCtx()
    ctx2.robotsText = 'User-agent: PerplexityBot\nDisallow: /'
    ctx2.entryPage = null
    expect(rule('G01').evaluate(ctx2)).toBeNull()
  })
})

const schema = (s: Partial<RuleContext['schemas'][number]>): RuleContext['schemas'][number] => ({
  id: 's1',
  source: 'entry',
  sitePageId: null,
  types: [],
  sameAs: [],
  raw: [],
  blocks: [],
  ...s,
})

describe('E01 Organization schema missing authoritative sameAs', () => {
  it('notice when Organization has empty sameAs', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ id: 'sc1', types: ['Organization'], sameAs: [] })]
    const hit = rule('E01').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['sc1'])
    expect(hit.scope).toBe('geo:entity')
    expect(rule('E01').severity).toBe('notice')
    expect(hit.description).toContain('Bing')
  })
  it('notice when sameAs points to no authority node', () => {
    const ctx = baseCtx()
    ctx.schemas = [
      schema({ id: 'sc1', types: ['Organization'], sameAs: ['https://example.com/about'] }),
    ]
    const hit = rule('E01').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['sc1'])
    expect(hit.detail!.reason).toBe('no_authority')
  })
  it('null when sameAs points to an authority node', () => {
    const ctx = baseCtx()
    ctx.schemas = [
      schema({ id: 'sc1', types: ['Organization'], sameAs: ['https://www.wikidata.org/wiki/Q42'] }),
    ]
    expect(rule('E01').evaluate(ctx)).toBeNull()
  })
  it('null when no Organization-like schema present', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ id: 'sc1', types: ['Product'], sameAs: [] })]
    expect(rule('E01').evaluate(ctx)).toBeNull()
  })
})

const uaProbe = (
  crawlers: NonNullable<RuleContext['uaProbe']>['crawlers'],
  llmsExists = false,
): NonNullable<RuleContext['uaProbe']> => ({
  crawlers,
  llmsTxt: { exists: llmsExists, url: 'https://example.com/llms.txt' },
  evidenceId: 'ua1',
})

describe('G02 CDN/WAF blocks search AI crawler', () => {
  it('error when a search crawler is blocked at the transport layer', () => {
    const ctx = baseCtx()
    ctx.uaProbe = uaProbe([
      { ua: 'OAI-SearchBot', kind: 'search', url: 'https://example.com/', status: 403, blocked: true },
    ])
    const hit = rule('G02').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['ua1'])
    expect(hit.scope).toBe('geo:cdn')
    expect(rule('G02').claimType).toBe('measured_hard')
    const blocked = hit.detail!.blocked as { ua: string; url: string; status: number | null }[]
    expect(blocked[0]).toMatchObject({ ua: 'OAI-SearchBot', url: 'https://example.com/', status: 403 })
    // 与 robots 屏蔽（G01）区分措辞
    expect(hit.description).toContain('CDN/WAF')
  })
  it('does not report when only a training crawler is blocked', () => {
    const ctx = baseCtx()
    ctx.uaProbe = uaProbe([
      { ua: 'GPTBot', kind: 'training', url: 'https://example.com/', status: 403, blocked: true },
      { ua: 'OAI-SearchBot', kind: 'search', url: 'https://example.com/', status: 200, blocked: false },
    ])
    expect(rule('G02').evaluate(ctx)).toBeNull()
  })
  it('null when no crawler blocked', () => {
    const ctx = baseCtx()
    ctx.uaProbe = uaProbe([
      { ua: 'OAI-SearchBot', kind: 'search', url: 'https://example.com/', status: 200, blocked: false },
    ])
    expect(rule('G02').evaluate(ctx)).toBeNull()
  })
  it('null when uaProbe is null', () => {
    expect(rule('G02').evaluate(baseCtx())).toBeNull()
  })
})

describe('G08 llms.txt presence (record only)', () => {
  it('notice when llms.txt exists', () => {
    const ctx = baseCtx()
    ctx.uaProbe = uaProbe([], true)
    const hit = rule('G08').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['ua1'])
    expect(hit.scope).toBe('geo:llmstxt')
    expect(rule('G08').severity).toBe('notice')
    expect(rule('G08').claimType).toBe('measured_hard')
    expect(hit.detail!.exists).toBe(true)
    expect(hit.description).toContain('无证据')
  })
  it('null when llms.txt absent (avoid noise)', () => {
    const ctx = baseCtx()
    ctx.uaProbe = uaProbe([], false)
    expect(rule('G08').evaluate(ctx)).toBeNull()
  })
  it('null when uaProbe is null', () => {
    expect(rule('G08').evaluate(baseCtx())).toBeNull()
  })
})

const thirdParty = (
  wikiExists: boolean,
  redditMentions: number,
  windowDays = 365,
): NonNullable<RuleContext['thirdParty']> => ({
  wikipedia: { exists: wikiExists, title: wikiExists ? 'Example' : null, url: wikiExists ? 'https://en.wikipedia.org/wiki/Example' : null },
  reddit: { mentions: redditMentions, windowDays },
  evidenceId: 'tp1',
})

describe('G07 third-party corpus absence', () => {
  it('warning when no wikipedia AND reddit below threshold', () => {
    const ctx = baseCtx()
    ctx.thirdParty = thirdParty(false, 1)
    const hit = rule('G07').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['tp1'])
    expect(hit.scope).toBe('geo:thirdparty')
    expect(rule('G07').claimType).toBe('measured_sample')
    expect(hit.description).toContain('0.664')
  })
  it('null when wikipedia exists (signal met)', () => {
    const ctx = baseCtx()
    ctx.thirdParty = thirdParty(true, 0)
    expect(rule('G07').evaluate(ctx)).toBeNull()
  })
  it('null when reddit mentions at threshold (boundary, signal met)', () => {
    const ctx = baseCtx()
    ctx.thirdParty = thirdParty(false, 3) // === threshold, counts as enough
    expect(rule('G07').evaluate(ctx)).toBeNull()
  })
  it('warning at boundary just below threshold', () => {
    const ctx = baseCtx()
    ctx.thirdParty = thirdParty(false, 2)
    expect(rule('G07').evaluate(ctx)).not.toBeNull()
  })
  it('null when thirdParty is null', () => {
    expect(rule('G07').evaluate(baseCtx())).toBeNull()
  })
})

const probeSentiment = (s: Partial<ProbeSummary['sentiment']>): ProbeSummary => ({
  promptsTotal: 5,
  promptsPresent: 5,
  totalSamples: 5,
  perPrompt: [],
  sov: [],
  perEngine: [],
  sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0, ...s },
  sampleEvidenceId: 'ev',
})

describe('G09 negative citation sentiment', () => {
  it('warning when negative ratio >= 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = probeSentiment({ negative: 2, neutral: 3, total: 5 }) // 0.4
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G09').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['pe1'])
    expect(hit.scope).toBe('geo:sentiment')
    expect(rule('G09').claimType).toBe('inferred')
    expect(hit.detail!.negative).toBe(2)
    expect(hit.detail!.directional).toBe(true)
  })
  it('hits at exact boundary ratio 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = probeSentiment({ negative: 3, neutral: 7, total: 10 }) // 0.3
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G09').evaluate(ctx)).not.toBeNull()
  })
  it('null when negative ratio below 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = probeSentiment({ negative: 1, neutral: 4, total: 5 }) // 0.2
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G09').evaluate(ctx)).toBeNull()
  })
  it('null when total === 0', () => {
    const ctx = baseCtx()
    ctx.probe = probeSentiment({ total: 0 })
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G09').evaluate(ctx)).toBeNull()
  })
  it('null when probe or probeEvidenceId is null', () => {
    const ctx = baseCtx()
    ctx.probe = probeSentiment({ negative: 3, total: 5 })
    ctx.probeEvidenceId = null
    expect(rule('G09').evaluate(ctx)).toBeNull()
    const ctx2 = baseCtx()
    ctx2.probe = null
    ctx2.probeEvidenceId = 'pe1'
    expect(rule('G09').evaluate(ctx2)).toBeNull()
  })
})
