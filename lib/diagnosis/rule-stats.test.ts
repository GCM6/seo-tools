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

// 执行过的建议（accepted 且标记已执行）——只有这类建议的 outcome 才进效果统计。
const mkRec = (id: string, ruleId: string, outcome: RecStatRecord['outcome'], exec: Partial<RecStatRecord> = {}): RecStatRecord => ({
  id, ruleId, outcome, status: 'accepted', appliedAt: '2026-01-15T00:00:00.000Z', ...exec,
})

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
      ...Array.from({ length: 18 }, (_, i) => mkRec(`r_i_${i}`, 'A03', 'ineffective')),
      ...Array.from({ length: 3 }, (_, i) => mkRec(`r_r_${i}`, 'A03', 'regressed')),
      ...Array.from({ length: 2 }, (_, i) => mkRec(`r_e_${i}`, 'A03', 'effective')),
      mkRec('r_u', 'A03', 'unknown'), // unknown 不计入分母
    ]
    const out = aggregateRuleStats([], recs)
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('effectiveness_stats')
    expect(out[0].target).toBe('A03')
    expect(out[0].diff.signal).toBe('low_effectiveness')
    expect(out[0].evidenceRefs).not.toContain('r_u') // unknown 被排除
  })

  // 2026-10-08 修复：库里已有没执行却被判 ineffective 的旧行，统计时必须按「是否执行过」再过滤一遍，
  // 不能只信 outcome 字段。
  it('没执行的建议即使 outcome=ineffective 也不进效果统计', () => {
    const recs: RecStatRecord[] = [
      ...Array.from({ length: 12 }, (_, i) => mkRec(`r_draft_${i}`, 'A04', 'ineffective', { status: 'draft', appliedAt: null })),
      ...Array.from({ length: 6 }, (_, i) => mkRec(`r_acc_${i}`, 'A04', 'ineffective', { appliedAt: null })),
      ...Array.from({ length: 6 }, (_, i) => mkRec(`r_rej_${i}`, 'A04', 'ineffective', { status: 'rejected' })),
    ]
    expect(aggregateRuleStats([], recs)).toEqual([])
  })

  it('执行过的建议照常计入：混入的未执行行不改变提案的证据列表', () => {
    const recs: RecStatRecord[] = [
      ...Array.from({ length: 21 }, (_, i) => mkRec(`r_done_${i}`, 'A05', 'ineffective')),
      ...Array.from({ length: 2 }, (_, i) => mkRec(`r_ok_${i}`, 'A05', 'effective')),
      ...Array.from({ length: 5 }, (_, i) => mkRec(`r_draft_${i}`, 'A05', 'ineffective', { status: 'draft', appliedAt: null })),
    ]
    const out = aggregateRuleStats([], recs)
    expect(out).toHaveLength(1)
    expect(out[0].diff.sampleSize).toBe(23)
    expect(out[0].evidenceRefs.some((id) => id.startsWith('r_draft_'))).toBe(false)
  })
})
