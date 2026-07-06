import { describe, it, expect } from 'vitest'
import { buildReport, type ReportFinding, type ReportRecommendation } from './report'

const now = new Date('2026-07-06T00:00:00Z')

const finding = (over: Partial<ReportFinding>): ReportFinding => ({
  id: over.id ?? 'f1',
  side: 'technical',
  pillar: 'P1',
  title: 't',
  description: 'd',
  severity: 'mid',
  claimType: 'inferred',
  confidence: '推断',
  evidenceRefs: ['ev1'],
  status: 'open',
  ...over,
})

const rec = (over: Partial<ReportRecommendation>): ReportRecommendation => ({
  id: over.id ?? 'r1',
  findingId: over.findingId ?? 'f1',
  what: 'w',
  why: 'y',
  expectedImpact: 'i',
  effort: '低',
  priority: 'quick_win',
  confidence: '推断',
  status: 'draft',
  outcome: 'unknown',
  validationMethod: 'vm',
  ...over,
})

describe('buildReport constraint locator', () => {
  it('P1 error → systemic_basics', () => {
    const m = buildReport({ findings: [finding({ pillar: 'P1', severity: 'high' })], recommendations: [], now })
    expect(m.execSummary.constraint.kind).toBe('systemic_basics')
    expect(m.execSummary.constraint.focusPillars).toEqual(['P1'])
  })

  it('no P3 data → visibility_data_missing', () => {
    const m = buildReport({
      findings: [finding({ pillar: 'P2', severity: 'mid' })],
      recommendations: [],
      pillarsWithData: ['P1', 'P2'],
      now,
    })
    expect(m.execSummary.constraint.kind).toBe('visibility_data_missing')
  })

  it('heavy P3 gaps + weak P4/P5 → authority_content', () => {
    const findings = [
      finding({ id: 'k1', pillar: 'P3', severity: 'mid' }),
      finding({ id: 'k2', pillar: 'P3', severity: 'mid' }),
      finding({ id: 'k3', pillar: 'P3', severity: 'mid' }),
      finding({ id: 'a1', pillar: 'P5', severity: 'mid' }),
      finding({ id: 'a2', pillar: 'P4', severity: 'mid' }),
    ]
    const m = buildReport({ findings, recommendations: [], pillarsWithData: ['P1', 'P2', 'P3', 'P4', 'P5'], now })
    expect(m.execSummary.constraint.kind).toBe('authority_content')
    expect(m.execSummary.constraint.focusPillars).toEqual(['P3', 'P5'])
  })

  it('otherwise → fine_tuning', () => {
    const m = buildReport({
      findings: [finding({ pillar: 'P2', severity: 'ok' }), finding({ id: 'x', pillar: 'P3', severity: 'ok' })],
      recommendations: [],
      pillarsWithData: ['P1', 'P2', 'P3', 'P4', 'P5'],
      now,
    })
    expect(m.execSummary.constraint.kind).toBe('fine_tuning')
  })
})

describe('buildReport aggregation', () => {
  it('excludes dismissed findings from counts, health and top findings', () => {
    const m = buildReport({
      findings: [finding({ id: 'a', severity: 'high' }), finding({ id: 'b', severity: 'mid', status: 'dismissed' })],
      recommendations: [],
      now,
    })
    expect(m.counts.findings).toBe(1)
    expect(m.counts.dismissed).toBe(1)
    expect(m.execSummary.topFindings.map((f) => f.id)).toEqual(['a'])
  })

  it('ranks top findings by severity weight', () => {
    const m = buildReport({
      findings: [finding({ id: 'ok', severity: 'ok' }), finding({ id: 'hi', severity: 'high' }), finding({ id: 'mid', severity: 'mid' })],
      recommendations: [],
      now,
    })
    expect(m.execSummary.topFindings.map((f) => f.id)).toEqual(['hi', 'mid', 'ok'])
  })

  it('buckets recommendations into priority quadrants', () => {
    const m = buildReport({
      findings: [finding({})],
      recommendations: [rec({ id: 'a', priority: 'quick_win' }), rec({ id: 'b', priority: 'strategic' }), rec({ id: 'c', priority: 'weird' })],
      now,
    })
    expect(m.priorityMatrix.quick_win.map((r) => r.id)).toEqual(['a'])
    expect(m.priorityMatrix.strategic.map((r) => r.id)).toEqual(['b'])
    expect(m.priorityMatrix.fill_in.map((r) => r.id)).toEqual(['c']) // 未知象限兜底 fill_in
  })

  it('roadmap only includes gated recs, horizon by effort', () => {
    const m = buildReport({
      findings: [finding({})],
      recommendations: [
        rec({ id: 'q', status: 'accepted', effort: '低' }),
        rec({ id: 'm', status: 'edited', effort: '中' }),
        rec({ id: 'l', status: 'accepted', effort: '高' }),
        rec({ id: 'draft', status: 'draft', effort: '低' }),
      ],
      now,
    })
    const horizons = Object.fromEntries(m.roadmap.map((i) => [i.recommendation.id, i.horizon]))
    expect(horizons).toEqual({ q: 'quick', m: 'mid', l: 'long' }) // draft 不进路线图
    expect(m.counts.gated).toBe(3)
  })
})
