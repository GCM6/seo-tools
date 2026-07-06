import { describe, it, expect } from 'vitest'
import type { RuleHit } from './types'
import { generateRecommendation, priorityQuadrant } from './recommend'

function hit(partial: Partial<RuleHit> & { ruleId: string }): RuleHit {
  return {
    ruleId: partial.ruleId,
    pillar: partial.pillar ?? 'P1',
    side: partial.side ?? 'technical',
    severity: partial.severity ?? 'warning',
    claimType: partial.claimType ?? 'measured_hard',
    title: partial.title ?? 't',
    description: partial.description ?? '该规则命中描述。',
    evidenceRefs: partial.evidenceRefs ?? ['ev_1'],
    scope: partial.scope ?? 'site',
    fingerprint: partial.fingerprint ?? 'fp',
    detail: partial.detail,
  }
}

describe('priorityQuadrant (Impact×Effort)', () => {
  it('maps the four quadrants', () => {
    expect(priorityQuadrant('high', 'low')).toBe('quick_win')
    expect(priorityQuadrant('high', 'mid')).toBe('strategic')
    expect(priorityQuadrant('high', 'high')).toBe('strategic')
    expect(priorityQuadrant('low', 'low')).toBe('fill_in')
    expect(priorityQuadrant('low', 'mid')).toBe('fill_in')
    expect(priorityQuadrant('low', 'high')).toBe('low')
  })
})

describe('generateRecommendation', () => {
  it('T04 error + low effort → quick_win, technical, carries fixSnippet in what', () => {
    const rec = generateRecommendation(hit({ ruleId: 'T04', severity: 'error' }))
    expect(rec.priority).toBe('quick_win')
    expect(rec.promptType).toBe('technical')
    expect(rec.what).toContain('rel="canonical"') // fixSnippet 并入 what
    expect(rec.effort).toBe('低')
    expect(rec.evidenceRefs).toEqual(['ev_1'])
    expect(rec.why).toContain('该规则命中描述') // why 源自 description
  })

  it('warning with large scope escalates impact to high → strategic for mid effort', () => {
    const rec = generateRecommendation(hit({ ruleId: 'C04', severity: 'warning', side: 'seo', detail: { affectedCount: 12 } }))
    // C04 effort=high, impact high → strategic
    expect(rec.priority).toBe('strategic')
    expect(rec.expectedImpact).toContain('12')
  })

  it('notice → low impact', () => {
    const rec = generateRecommendation(hit({ ruleId: 'C11', severity: 'notice', side: 'seo' }))
    // C11 effort=low, impact low → fill_in
    expect(rec.priority).toBe('fill_in')
  })

  it('confidence derives from claimType', () => {
    expect(generateRecommendation(hit({ ruleId: 'T04', claimType: 'measured_hard' })).confidence).toMatch(/实测/)
    expect(generateRecommendation(hit({ ruleId: 'C08', claimType: 'hypothesis', side: 'geo' })).confidence).toMatch(/假设/)
  })

  it('unknown ruleId falls back by side', () => {
    const tech = generateRecommendation(hit({ ruleId: 'ZZ99', side: 'technical' }))
    expect(tech.promptType).toBe('technical')
    const content = generateRecommendation(hit({ ruleId: 'ZZ98', side: 'geo' }))
    expect(content.promptType).toBe('content')
  })
})
