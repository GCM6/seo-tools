import { describe, it, expect } from 'vitest'
import { provenanceForClaim, labelKeyForLevel } from '@/lib/evidence'

describe('evidence ↔ label mapping (§5.1)', () => {
  it('measured_* → 实测(m)', () => {
    expect(provenanceForClaim('measured_hard').variant).toBe('m')
    expect(provenanceForClaim('measured_sample').variant).toBe('m')
  })
  it('inferred → 推断(i)', () => {
    expect(provenanceForClaim('inferred').variant).toBe('i')
  })
  it('hypothesis → 疑似(i)，不得标实测', () => {
    expect(provenanceForClaim('hypothesis').variant).not.toBe('m')
  })
  it('L3/L4 → measured label key; L2 → inferred', () => {
    expect(labelKeyForLevel('L4')).toBe('common.tag.measured')
    expect(labelKeyForLevel('L2')).toBe('common.tag.inferred')
  })
})
