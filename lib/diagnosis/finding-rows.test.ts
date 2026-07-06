import { describe, it, expect } from 'vitest'
import { buildFindingRows } from './finding-rows'
import type { RuleHit } from './types'

const hit: RuleHit = {
  ruleId: 'C05a',
  pillar: 'P3',
  side: 'technical',
  severity: 'error',
  claimType: 'inferred',
  fingerprint: 'abc',
  scope: 'https://example.com/',
  title: 'JSON-LD 缺失',
  description: '',
  evidenceRefs: ['ev_1'],
}

describe('buildFindingRows', () => {
  it('把 hit.ruleId 写进 FindingRow.ruleId', () => {
    const [row] = buildFindingRows('run_1', [hit])
    expect(row.ruleId).toBe('C05a')
    expect(row.runId).toBe('run_1')
    expect(row.fingerprint).toBe('abc')
  })
})
