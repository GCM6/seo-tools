import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
import type { ProbeSummary } from '@/lib/probes/summary'
import { competitorRules } from './competitors'

const rule = (id: string) => competitorRules.find((r) => r.id === id)!

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

const gap = (o: Partial<RuleContext['keywordGaps'][number]>): RuleContext['keywordGaps'][number] => ({
  keyword: 'kw', gapType: 'missing', ourPosition: null, opportunityScore: null, searchVolume: null, evidenceId: 'gap1', ...o,
})

const probe = (sov: ProbeSummary['sov']): ProbeSummary => ({
  promptsTotal: 5, promptsPresent: 2, totalSamples: 5, perPrompt: [], sov,
  perEngine: [], sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 },
  sampleEvidenceId: 'p1',
  // D4（GEO branded/unbranded 重设计）：新增必填字段，本文件测的是竞品 SoV 规则，与这三项无关，给中性默认值。
  unbranded: { present: 0, total: 0, wilsonLow: 0 }, branded: { perEngine: [] }, citationRate: 0, citedDomains: [], ugcCitationShare: null,
})

describe('Q01 share of SERP', () => {
  it('counts own vs confirmed competitor Top10 placements; measured_sample', () => {
    const ctx = baseCtx()
    ctx.confirmedCompetitors = [{ domain: 'rival.com', name: 'Rival' }]
    ctx.dataforseo.serpByKeyword = [
      {
        keyword: 'widgets',
        items: [
          { domain: 'rival.com', url: 'https://rival.com/a', rank: 1 },
          { domain: 'example.com', url: 'https://example.com/a', rank: 3 },
          { domain: 'rival.com', url: 'https://rival.com/b', rank: 12 }, // 超 Top10，不计
        ],
        evidenceId: 'serp1',
      },
    ]
    const hit = rule('Q01').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('Q01').claimType).toBe('measured_sample')
    expect(hit.evidenceRefs).toEqual(['serp1'])
    const cmp = hit.detail!.comparison as { domain: string; top10Count: number; you: boolean }[]
    expect(cmp.find((c) => c.you)!.top10Count).toBe(1)
    expect(cmp.find((c) => c.domain === 'rival.com')!.top10Count).toBe(1)
  })
  it('null when no confirmed competitors (human gate)', () => {
    const ctx = baseCtx()
    ctx.dataforseo.serpByKeyword = [
      { keyword: 'widgets', items: [{ domain: 'example.com', url: 'https://example.com', rank: 1 }], evidenceId: 'serp1' },
    ]
    expect(rule('Q01').evaluate(ctx)).toBeNull()
  })
  it('null when no SERP data', () => {
    const ctx = baseCtx()
    ctx.confirmedCompetitors = [{ domain: 'rival.com', name: 'Rival' }]
    expect(rule('Q01').evaluate(ctx)).toBeNull()
  })
})

describe('Q02 AI SoV comparison', () => {
  it('compares own vs matched competitor SoV; refs probe evidence', () => {
    const ctx = baseCtx()
    ctx.confirmedCompetitors = [{ domain: 'rival.com', name: 'Rival' }]
    ctx.probe = probe([
      { name: 'example.com', pct: 40, you: true },
      { name: 'rival.com', pct: 60, you: false },
    ])
    ctx.probeEvidenceId = 'probeEv'
    const hit = rule('Q02').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('Q02').side).toBe('geo')
    expect(hit.evidenceRefs).toEqual(['probeEv'])
    expect(hit.detail!.directional).toBe(true)
  })
  it('SP-A2 #6：detail.perEngine 给出分引擎对比（有 sovByEngine 时）', () => {
    const ctx = baseCtx()
    ctx.confirmedCompetitors = [{ domain: 'rival.com', name: 'Rival' }]
    const p = probe([
      { name: 'example.com', pct: 40, you: true },
      { name: 'Rival', pct: 60, you: false },
    ])
    p.sovByEngine = [
      { engine: 'openai', samples: 3, sov: [{ name: 'example.com', pct: 33, you: true }, { name: 'Rival', pct: 67, you: false }] },
      { engine: 'perplexity', samples: 2, sov: [{ name: 'example.com', pct: 50, you: true }] }, // 无 Rival → 该引擎被过滤
    ]
    ctx.probe = p
    ctx.probeEvidenceId = 'probeEv'
    const hit = rule('Q02').evaluate(ctx) as RuleHitDraft
    const perEngine = hit.detail!.perEngine as { engine: string; comparison: unknown[] }[]
    expect(perEngine.map((e) => e.engine)).toEqual(['openai']) // 仅保留有确认竞品匹配的引擎
    expect(perEngine[0].comparison).toHaveLength(2)
  })

  it('null when competitor not present in probe SoV set', () => {
    const ctx = baseCtx()
    ctx.confirmedCompetitors = [{ domain: 'notprobed.com', name: 'Other' }]
    ctx.probe = probe([{ name: 'example.com', pct: 40, you: true }])
    ctx.probeEvidenceId = 'probeEv'
    expect(rule('Q02').evaluate(ctx)).toBeNull()
  })
  it('null when no confirmed competitors', () => {
    const ctx = baseCtx()
    ctx.probe = probe([{ name: 'example.com', pct: 40, you: true }])
    ctx.probeEvidenceId = 'probeEv'
    expect(rule('Q02').evaluate(ctx)).toBeNull()
  })
})

describe('Q03 gap content form', () => {
  it('flags when confirmed competitors and gaps both present; inferred', () => {
    const ctx = baseCtx()
    ctx.confirmedCompetitors = [{ domain: 'rival.com', name: 'Rival' }]
    ctx.keywordGaps = [gap({ keyword: 'missingkw', gapType: 'missing', evidenceId: 'g1' })]
    const hit = rule('Q03').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('Q03').claimType).toBe('inferred')
    expect(hit.evidenceRefs).toEqual(['g1'])
  })
  it('null when no confirmed competitors', () => {
    const ctx = baseCtx()
    ctx.keywordGaps = [gap({})]
    expect(rule('Q03').evaluate(ctx)).toBeNull()
  })
  it('null when no gaps', () => {
    const ctx = baseCtx()
    ctx.confirmedCompetitors = [{ domain: 'rival.com', name: 'Rival' }]
    expect(rule('Q03').evaluate(ctx)).toBeNull()
  })
})

describe('all competitor rules no-op on empty context', () => {
  it('return null with no data and no confirmed competitors', () => {
    for (const r of competitorRules) {
      expect(r.evaluate(baseCtx())).toBeNull()
    }
  })
})
