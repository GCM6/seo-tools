import { describe, it, expect } from 'vitest'
import { provenanceForClaim, provenanceForLevel, labelKeyForLevel, gradeForClaim, gradeForLevel } from '@/lib/evidence'

describe('evidence ↔ badge grade mapping (§5.1, design-system §3.1)', () => {
  it('measured_hard → 实测(hard)，measured_sample → 抽样实测(sample)，两者都带「实测」字样', () => {
    expect(provenanceForClaim('measured_hard')).toEqual({ grade: 'hard', labelKey: 'common.tag.measured' })
    expect(provenanceForClaim('measured_sample')).toEqual({ grade: 'sample', labelKey: 'common.tag.sampled' })
  })

  it('inferred → 推断(inferred)', () => {
    expect(gradeForClaim('inferred')).toBe('inferred')
  })

  it('hypothesis → 疑似(hypothesis)，不得标实测，也不得与推断共用同一形状', () => {
    const p = provenanceForClaim('hypothesis')
    expect(p.grade).toBe('hypothesis')
    expect(p.labelKey).toBe('common.tag.suspected')
    expect(p.grade).not.toBe(gradeForClaim('inferred'))
  })

  it('证据等级 L4/L3/L2/L1/L0 → hard/sample/inferred/hypothesis/hypothesis', () => {
    expect(gradeForLevel('L4')).toBe('hard')
    expect(gradeForLevel('L3')).toBe('sample')
    expect(gradeForLevel('L2')).toBe('inferred')
    expect(gradeForLevel('L1')).toBe('hypothesis')
    expect(gradeForLevel('L0')).toBe('hypothesis')
  })

  it('L3/L4 的文案 key 含「实测」语义，L2 → 推断', () => {
    expect(labelKeyForLevel('L4')).toBe('common.tag.measured')
    expect(labelKeyForLevel('L3')).toBe('common.tag.sampled')
    expect(labelKeyForLevel('L2')).toBe('common.tag.inferred')
    expect(provenanceForLevel('L1').labelKey).toBe('common.tag.suspected')
  })
})
