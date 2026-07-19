import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
import { reputationRules } from './reputation'
import { allRules } from './index'

const rule = (id: string) => reputationRules.find((r) => r.id === id)!

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

const socialPresence = (
  platforms: NonNullable<RuleContext['socialPresence']>['platforms'],
): NonNullable<RuleContext['socialPresence']> => ({
  brand: 'Acme',
  platforms,
  checkedAt: '2026-07-15T00:00:00.000Z',
  evidenceId: 'sp1',
})

describe('reputationRules registration', () => {
  it('SP01/SP02 are registered in allRules', () => {
    expect(allRules.map((r) => r.id)).toEqual(expect.arrayContaining(['SP01', 'SP02']))
  })
})

describe('SP01 未发现品牌相关 YouTube 内容', () => {
  it('warning when youtube resultCount === 0', () => {
    const ctx = baseCtx()
    ctx.socialPresence = socialPresence([{ platform: 'youtube', query: 'Acme review', resultCount: 0, topResults: [] }])
    const hit = rule('SP01').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(rule('SP01').claimType).toBe('inferred')
    expect(rule('SP01').severity).toBe('warning')
    expect(hit.evidenceRefs).toEqual(['sp1'])
    expect(hit.evidenceRefs.length).toBeGreaterThan(0)
    expect(hit.description).toContain('前台检索')
  })
  it('null when youtube has results', () => {
    const ctx = baseCtx()
    ctx.socialPresence = socialPresence([
      { platform: 'youtube', query: 'Acme review', resultCount: 3, topResults: [{ title: 'Acme demo', url: 'https://youtube.com/x' }] },
    ])
    expect(rule('SP01').evaluate(ctx)).toBeNull()
  })
  it('null when youtube not checked (platform absent)', () => {
    const ctx = baseCtx()
    ctx.socialPresence = socialPresence([{ platform: 'g2', query: 'Acme', resultCount: 0, topResults: [] }])
    expect(rule('SP01').evaluate(ctx)).toBeNull()
  })
  it('null (no-op) when socialPresence is null', () => {
    const ctx = baseCtx()
    expect(rule('SP01').evaluate(ctx)).toBeNull()
  })
})

describe('SP02 未发现品牌在主流第三方评价站的收录', () => {
  it('notice when g2/trustpilot/capterra all resultCount === 0', () => {
    const ctx = baseCtx()
    ctx.socialPresence = socialPresence([
      { platform: 'g2', query: 'Acme', resultCount: 0, topResults: [] },
      { platform: 'trustpilot', query: 'Acme', resultCount: 0, topResults: [] },
      { platform: 'capterra', query: 'Acme', resultCount: 0, topResults: [] },
    ])
    const hit = rule('SP02').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(rule('SP02').claimType).toBe('inferred')
    expect(rule('SP02').severity).toBe('notice')
    expect(hit.evidenceRefs).toEqual(['sp1'])
    expect(hit.evidenceRefs.length).toBeGreaterThan(0)
  })
  it('null when any of the three has results', () => {
    const ctx = baseCtx()
    ctx.socialPresence = socialPresence([
      { platform: 'g2', query: 'Acme', resultCount: 1, topResults: [{ title: 'Acme on G2', url: 'https://g2.com/x' }] },
      { platform: 'trustpilot', query: 'Acme', resultCount: 0, topResults: [] },
      { platform: 'capterra', query: 'Acme', resultCount: 0, topResults: [] },
    ])
    expect(rule('SP02').evaluate(ctx)).toBeNull()
  })
  it('null when not all three sites checked (incomplete data)', () => {
    const ctx = baseCtx()
    ctx.socialPresence = socialPresence([
      { platform: 'g2', query: 'Acme', resultCount: 0, topResults: [] },
      { platform: 'trustpilot', query: 'Acme', resultCount: 0, topResults: [] },
    ])
    expect(rule('SP02').evaluate(ctx)).toBeNull()
  })
  it('null (no-op) when socialPresence is null', () => {
    const ctx = baseCtx()
    expect(rule('SP02').evaluate(ctx)).toBeNull()
  })
})
