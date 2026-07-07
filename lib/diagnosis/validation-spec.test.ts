import { describe, it, expect } from 'vitest'
import { deriveValidationSpec } from './validation-spec'
import { templates } from './templates'
import type { RuleHit } from './types'

const hit = (o: Partial<RuleHit>): RuleHit =>
  ({
    ruleId: 'X', pillar: 'P3', side: 'seo', severity: 'warning', claimType: 'inferred',
    title: '', description: '', evidenceRefs: ['e1'], scope: 'kw:widget', fingerprint: 'fp', ...o,
  }) as RuleHit

describe('deriveValidationSpec', () => {
  it('无 override：按支柱默认 + hit 派生 scope', () => {
    expect(deriveValidationSpec(hit({}))).toEqual({
      metricSource: 'gsc', metric: 'impressions', scope: 'kw:widget', direction: 'increase', windowDays: 28,
    })
  })

  it('Partial override 只覆盖声明字段，保留 hit scope 与其余默认', () => {
    expect(deriveValidationSpec(hit({}), { metric: 'position', direction: 'decrease' })).toEqual({
      metricSource: 'gsc', metric: 'position', scope: 'kw:widget', direction: 'decrease', windowDays: 28,
    })
  })

  it('K02/K06 模板覆盖为 gsc position/decrease', () => {
    for (const id of ['K02', 'K06'] as const) {
      const spec = deriveValidationSpec(hit({ ruleId: id }), templates[id].validationSpec)
      expect(spec.metricSource).toBe('gsc')
      expect(spec.metric).toBe('position')
      expect(spec.direction).toBe('decrease')
    }
  })
})
