import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
import { authorityRules } from './authority'

const rule = (id: string) => authorityRules.find((r) => r.id === id)!

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

type Backlink = RuleContext['dataforseo']['backlinks'][number]
const bl = (o: Partial<Backlink>): Backlink => ({
  target: 'example.com', referringDomains: 100, backlinks: 1000, rank: 50, anchors: [], newLost: null, evidenceId: 'bl1', ...o,
})

describe('A01 backlink overview', () => {
  it('flags when own referring domains below competitor median; measured_sample', () => {
    const ctx = baseCtx()
    ctx.confirmedCompetitors = [{ domain: 'a.com', name: 'A' }, { domain: 'b.com', name: 'B' }]
    ctx.dataforseo.backlinks = [
      bl({ target: 'example.com', referringDomains: 50, evidenceId: 'own' }),
      bl({ target: 'a.com', referringDomains: 200, evidenceId: 'ca' }),
      bl({ target: 'b.com', referringDomains: 300, evidenceId: 'cb' }),
    ]
    const hit = rule('A01').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('A01').claimType).toBe('measured_sample')
    expect(hit.severity).toBe('warning')
    expect(hit.evidenceRefs).toEqual(['own', 'ca', 'cb'])
    expect(hit.detail!.competitorMedianReferringDomains).toBe(250)
  })
  it('own-only overview (notice) when no competitor backlinks', () => {
    const ctx = baseCtx()
    ctx.dataforseo.backlinks = [bl({ target: 'example.com', evidenceId: 'own' })]
    const hit = rule('A01').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(hit.severity).toBe('notice')
    expect(hit.evidenceRefs).toEqual(['own'])
  })
  it('null when no own backlinks', () => {
    expect(rule('A01').evaluate(baseCtx())).toBeNull()
  })
})

describe('A02 anchor over-optimization', () => {
  it('flags high exact-keyword anchor share', () => {
    const ctx = baseCtx()
    ctx.dataforseo.backlinks = [
      bl({
        target: 'example.com', evidenceId: 'own',
        anchors: [
          { anchor: 'best cheap widgets online', count: 60, dofollow: true },
          { anchor: 'example', count: 20, dofollow: true }, // 品牌锚
          { anchor: 'click here', count: 20, dofollow: false }, // 通用锚
        ],
      }),
    ]
    const hit = rule('A02').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('A02').claimType).toBe('measured_sample')
    expect(hit.evidenceRefs).toEqual(['own'])
  })
  it('null for natural anchor profile', () => {
    const ctx = baseCtx()
    ctx.dataforseo.backlinks = [
      bl({
        target: 'example.com', evidenceId: 'own',
        anchors: [
          { anchor: 'example', count: 70, dofollow: true },
          { anchor: 'https://example.com', count: 20, dofollow: true },
          { anchor: 'click here', count: 10, dofollow: false },
        ],
      }),
    ]
    expect(rule('A02').evaluate(ctx)).toBeNull()
  })
  it('null when no anchors', () => {
    const ctx = baseCtx()
    ctx.dataforseo.backlinks = [bl({ target: 'example.com', anchors: [] })]
    expect(rule('A02').evaluate(ctx)).toBeNull()
  })
})

describe('A03 link velocity', () => {
  it('flags asymmetric spike; inferred', () => {
    const ctx = baseCtx()
    ctx.dataforseo.backlinks = [bl({ target: 'example.com', evidenceId: 'own', newLost: { new: 500, lost: 10, windowDays: 30 } })]
    const hit = rule('A03').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('A03').claimType).toBe('inferred')
    expect(hit.evidenceRefs).toEqual(['own'])
  })
  it('null for balanced growth', () => {
    const ctx = baseCtx()
    ctx.dataforseo.backlinks = [bl({ target: 'example.com', newLost: { new: 30, lost: 25, windowDays: 30 } })]
    expect(rule('A03').evaluate(ctx)).toBeNull()
  })
  it('null when no newLost data', () => {
    const ctx = baseCtx()
    ctx.dataforseo.backlinks = [bl({ target: 'example.com', newLost: null })]
    expect(rule('A03').evaluate(ctx)).toBeNull()
  })
})

describe('G04 Bing index', () => {
  it('flags zero Bing index; side geo, measured_sample', () => {
    const ctx = baseCtx()
    ctx.dataforseo.bingIndex = { domain: 'example.com', totalCount: 0, itemCount: 0, evidenceId: 'bi1' }
    const hit = rule('G04').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('G04').side).toBe('geo')
    expect(rule('G04').claimType).toBe('measured_sample')
    expect(hit.evidenceRefs).toEqual(['bi1'])
  })
  it('null when index above low threshold', () => {
    const ctx = baseCtx()
    ctx.dataforseo.bingIndex = { domain: 'example.com', totalCount: 500, itemCount: 10, evidenceId: 'bi1' }
    expect(rule('G04').evaluate(ctx)).toBeNull()
  })
  it('null when no bingIndex', () => {
    expect(rule('G04').evaluate(baseCtx())).toBeNull()
  })
})

describe('E02 knowledge panel', () => {
  it('flags missing knowledge panel; notice, no penalty claim', () => {
    const ctx = baseCtx()
    ctx.dataforseo.brandSerp = { brandQuery: 'example', hasKnowledgePanel: false, ownDomainPresent: true, items: [], evidenceId: 'bs1' }
    const hit = rule('E02').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('E02').severity).toBe('notice')
    expect(hit.evidenceRefs).toEqual(['bs1'])
  })
  it('null when knowledge panel present', () => {
    const ctx = baseCtx()
    ctx.dataforseo.brandSerp = { brandQuery: 'example', hasKnowledgePanel: true, ownDomainPresent: true, items: [], evidenceId: 'bs1' }
    expect(rule('E02').evaluate(ctx)).toBeNull()
  })
  it('null when no brandSerp', () => {
    expect(rule('E02').evaluate(baseCtx())).toBeNull()
  })
})

describe('E03 brand search volume comparison', () => {
  it('compares own vs competitor brand volume; measured_sample, side geo', () => {
    const ctx = baseCtx()
    ctx.confirmedCompetitors = [{ domain: 'rival.com', name: 'Rival' }]
    ctx.dataforseo.keywordData = [
      { keyword: 'example', searchVolume: 1000, difficulty: null, cpc: null, intent: null, evidenceId: 'own' },
      { keyword: 'rival reviews', searchVolume: 3000, difficulty: null, cpc: null, intent: null, evidenceId: 'crv' },
    ]
    const hit = rule('E03').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('E03').side).toBe('geo')
    expect(rule('E03').claimType).toBe('measured_sample')
    expect(hit.evidenceRefs).toContain('own')
    expect(hit.evidenceRefs).toContain('crv')
    expect(hit.detail!.correlationalOnly).toBe(true)
  })
  it('null when no confirmed competitors', () => {
    const ctx = baseCtx()
    ctx.dataforseo.keywordData = [{ keyword: 'example', searchVolume: 1000, difficulty: null, cpc: null, intent: null, evidenceId: 'own' }]
    expect(rule('E03').evaluate(ctx)).toBeNull()
  })
  it('null when no competitor brand volume matched', () => {
    const ctx = baseCtx()
    ctx.confirmedCompetitors = [{ domain: 'rival.com', name: 'Rival' }]
    ctx.dataforseo.keywordData = [{ keyword: 'example', searchVolume: 1000, difficulty: null, cpc: null, intent: null, evidenceId: 'own' }]
    expect(rule('E03').evaluate(ctx)).toBeNull()
  })
})

describe('competitor-dependent authority rules no-op without confirmed competitors', () => {
  it('A01 compare / E03 return null when no confirmed competitors and no data', () => {
    for (const r of authorityRules) {
      expect(r.evaluate(baseCtx())).toBeNull()
    }
  })
})
