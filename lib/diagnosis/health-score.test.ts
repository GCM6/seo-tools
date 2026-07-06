import { describe, it, expect } from 'vitest'
import { computeHealthScore, PILLAR_WEIGHTS, DEFAULT_MAX_PENALTY } from './health-score'
import type { HealthScoreInput } from './health-score'
import type { Pillar } from './types'

const ALL: Pillar[] = ['P1', 'P2', 'P3', 'P4', 'P5']

function input(over: Partial<HealthScoreInput> = {}): HealthScoreInput {
  return { findings: [], pillarsWithData: ALL, ...over }
}

describe('computeHealthScore', () => {
  it('scores a fully clean site (no findings) at 100 across all pillars and overall', () => {
    const r = computeHealthScore(input())
    for (const p of ALL) expect(r.pillars[p].score).toBe(100)
    expect(r.overall).toBe(100)
  })

  it('exposes the canonical pillar weights (P1 .30 / P2 .20 / P3 .20 / P4 .10 / P5 .20)', () => {
    const r = computeHealthScore(input())
    expect(r.weights).toEqual({ P1: 0.3, P2: 0.2, P3: 0.2, P4: 0.1, P5: 0.2 })
    expect(PILLAR_WEIGHTS).toEqual(r.weights)
    const sum = ALL.reduce((s, p) => s + r.weights[p], 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it('drops the pillar score when an error (high) finding is present', () => {
    // one site-level high finding: penalty = 3 × 1 = 3; maxPenalty 12 → 100×(1−3/12)=75
    const r = computeHealthScore(
      input({ findings: [{ pillar: 'P1', severity: 'high' }] }),
    )
    expect(r.pillars.P1.score).toBe(75)
    expect(r.pillars.P1.issueCount).toBe(1)
  })

  it('weights a notice (ok) far less than an error (high)', () => {
    const r = computeHealthScore(
      input({
        findings: [
          { pillar: 'P1', severity: 'high' }, // penalty 3 → 75
          { pillar: 'P2', severity: 'ok' }, // penalty 0.25 → ~97.9
        ],
      }),
    )
    expect(r.pillars.P1.score).toBe(75)
    // scores are rounded to 1 decimal for display: 100×(1−0.25/12)=97.916… → 97.9
    expect(r.pillars.P2.score).toBe(97.9)
    // notice-only pillar must stay much closer to 100 than the error pillar
    expect(r.pillars.P2.score! - r.pillars.P1.score!).toBeGreaterThan(20)
  })

  it('honours affectedRatio (partial page impact penalises less than site-level)', () => {
    const r = computeHealthScore(
      input({ findings: [{ pillar: 'P1', severity: 'high', affectedRatio: 0.5 }] }),
    )
    // penalty = 3 × 0.5 = 1.5 → 100×(1−1.5/12)=87.5
    expect(r.pillars.P1.score).toBe(87.5)
  })

  it('defaults a missing affectedRatio to 1 (site-level)', () => {
    const withDefault = computeHealthScore(
      input({ findings: [{ pillar: 'P3', severity: 'mid' }] }),
    )
    const explicit = computeHealthScore(
      input({ findings: [{ pillar: 'P3', severity: 'mid', affectedRatio: 1 }] }),
    )
    expect(withDefault.pillars.P3.score).toBe(explicit.pillars.P3.score)
  })

  it('marks a pillar with no collected data as null (未评分) and excludes it from overall', () => {
    const r = computeHealthScore(input({ pillarsWithData: ['P1', 'P2'] }))
    expect(r.pillars.P3.score).toBeNull()
    expect(r.pillars.P4.score).toBeNull()
    expect(r.pillars.P5.score).toBeNull()
    expect(r.pillars.P1.score).toBe(100)
    expect(r.pillars.P2.score).toBe(100)
    // overall averages only scored pillars → still 100
    expect(r.overall).toBe(100)
  })

  it('reweights the overall proportionally when some pillars are unscored', () => {
    // only P1 (.30) and P2 (.20) have data; P1 has one high finding → 75, P2 clean → 100
    const r = computeHealthScore(
      input({ pillarsWithData: ['P1', 'P2'], findings: [{ pillar: 'P1', severity: 'high' }] }),
    )
    // (0.30×75 + 0.20×100) / (0.30+0.20) = 42.5 / 0.5 = 85
    expect(r.overall).toBeCloseTo(85, 6)
  })

  it('clamps a heavily-penalised pillar at 0 (never negative)', () => {
    // 5 site-level high findings: penalty = 15 > maxPenalty 12 → would be −25, clamps to 0
    const findings = Array.from({ length: 5 }, () => ({ pillar: 'P1' as Pillar, severity: 'high' as const }))
    const r = computeHealthScore(input({ findings }))
    expect(r.pillars.P1.score).toBe(0)
    expect(r.pillars.P1.issueCount).toBe(5)
  })

  it('returns null overall when no pillar has data', () => {
    const r = computeHealthScore(input({ pillarsWithData: [] }))
    expect(r.overall).toBeNull()
    for (const p of ALL) expect(r.pillars[p].score).toBeNull()
  })

  it('respects a custom maxPenalty', () => {
    const r = computeHealthScore(
      input({ findings: [{ pillar: 'P1', severity: 'high' }], maxPenalty: 10 }),
    )
    // penalty 3 / 10 → 100×(1−0.3)=70
    expect(r.pillars.P1.score).toBe(70)
    expect(DEFAULT_MAX_PENALTY).toBe(12)
  })

  it('always labels the breakdown as 推断/inferred and explains the maths (Chinese)', () => {
    const r = computeHealthScore(input({ findings: [{ pillar: 'P1', severity: 'high' }] }))
    expect(r.breakdown).toContain('推断')
    expect(r.breakdown).toContain('未评分')
    expect(r.breakdown).toMatch(/加权平均|加权/)
    // mentions the formula divisor
    expect(r.breakdown).toContain('12')
  })
})
