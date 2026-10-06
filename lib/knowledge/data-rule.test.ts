import { describe, expect, it } from 'vitest'
import { evaluateDataRule } from './data-rule'

describe('safe data-driven rule evaluator', () => {
  const context = { siteAudit: { stats: { checked: 100, http4xx: 12 } }, project: { market: 'US' } }
  it('evaluates allowlisted scalar and ratio operations', () => {
    expect(evaluateDataRule({ id: 'x', path: 'project.market', operator: 'eq', value: 'US' }, context)).toBe(true)
    expect(evaluateDataRule({ id: 'x', path: 'siteAudit.stats.http4xx', operator: 'ratio', denominatorPath: 'siteAudit.stats.checked', value: 0.1 }, context)).toBe(true)
  })
  it('rejects arbitrary context paths', () => {
    expect(() => evaluateDataRule({ id: 'x', path: '__proto__.polluted', operator: 'exists' }, context)).toThrow('data_rule_path_not_allowed')
  })
})
