import { describe, it, expect } from 'vitest'
import { wilsonLowerBound, aggregateRuleStats } from './rule-stats'
import type { FindingStatRecord, RecStatRecord } from './rule-stats'

describe('wilsonLowerBound', () => {
  it('total=0 返回 0', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0)
  })
  it('全成功小样本下限被拉低（区间宽）', () => {
    // 3/3 的 Wilson 95% 下限约 0.44，远低于点估计 1
    const lb = wilsonLowerBound(3, 3)
    expect(lb).toBeGreaterThan(0.4)
    expect(lb).toBeLessThan(0.5)
  })
  it('大样本高比例下限逼近点估计', () => {
    const lb = wilsonLowerBound(90, 100)
    expect(lb).toBeGreaterThan(0.82)
    expect(lb).toBeLessThan(0.9)
  })
})

const mkFindings = (ruleId: string, dismissed: number, open: number): FindingStatRecord[] => [
  ...Array.from({ length: dismissed }, (_, i) => ({ id: `f_d_${ruleId}_${i}`, ruleId, status: 'dismissed' as const })),
  ...Array.from({ length: open }, (_, i) => ({ id: `f_o_${ruleId}_${i}`, ruleId, status: 'open' as const })),
]

describe('aggregateRuleStats', () => {
  it('样本量 < N_MIN 不出提案', () => {
    const out = aggregateRuleStats(mkFindings('A01', 10, 0), [])
    expect(out).toEqual([])
  })

  it('高 dismiss 率 + 足够样本 → dismissal_stats 提案（evidence = finding id 列表）', () => {
    const findings = mkFindings('A02', 24, 1) // 24/25 dismissed，Wilson 下限 > 0.5
    const out = aggregateRuleStats(findings, [])
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('dismissal_stats')
    expect(out[0].changeType).toBe('modify_threshold')
    expect(out[0].target).toBe('A02')
    expect(out[0].diff.signal).toBe('high_dismiss_rate')
    expect(out[0].evidenceRefs.length).toBe(25) // 全部参与聚合的 finding id
    expect(out[0].evidenceRefs.every((r) => typeof r === 'string')).toBe(true)
  })

  it('低效（ineffective+regressed）率高 + 足够已判样本 → effectiveness_stats 提案', () => {
    const recs: RecStatRecord[] = [
      ...Array.from({ length: 18 }, (_, i) => ({ id: `r_i_${i}`, ruleId: 'A03', outcome: 'ineffective' as const })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `r_r_${i}`, ruleId: 'A03', outcome: 'regressed' as const })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `r_e_${i}`, ruleId: 'A03', outcome: 'effective' as const })),
      { id: 'r_u', ruleId: 'A03', outcome: 'unknown' as const }, // unknown 不计入分母
    ]
    const out = aggregateRuleStats([], recs)
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('effectiveness_stats')
    expect(out[0].target).toBe('A03')
    expect(out[0].diff.signal).toBe('low_effectiveness')
    expect(out[0].evidenceRefs).not.toContain('r_u') // unknown 被排除
  })
})
