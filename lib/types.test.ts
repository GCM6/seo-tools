import { describe, it, expect } from 'vitest'
import { CLAIM_TYPES, EVIDENCE_LEVELS, isMeasured } from '@/lib/types'

describe('domain types', () => {
  it('claim types match the spec set', () => {
    expect(CLAIM_TYPES).toEqual(['hypothesis', 'inferred', 'measured_sample', 'measured_hard'])
  })
  it('evidence levels are L0..L4', () => {
    expect(EVIDENCE_LEVELS).toEqual(['L0', 'L1', 'L2', 'L3', 'L4'])
  })
  it('only measured_* claim types count as measured', () => {
    expect(isMeasured('measured_sample')).toBe(true)
    expect(isMeasured('measured_hard')).toBe(true)
    expect(isMeasured('inferred')).toBe(false)
    expect(isMeasured('hypothesis')).toBe(false)
  })
})
