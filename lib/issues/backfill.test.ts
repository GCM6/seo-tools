import { describe, it, expect } from 'vitest'
import { replayHistory, type ReplayInput } from './backfill'

const f = (id: string, runId: string, fp: string, over: Record<string, unknown> = {}) => ({
  id, runId, fingerprint: fp, ruleId: `R_${fp}`, title: fp, pillar: 'P2', side: 'seo', severity: 'mid', status: 'open', dismissReason: null, detail: null, ...over,
})
const input = (over: Partial<ReplayInput> = {}): ReplayInput => {
  let i = 0
  let e = 0
  return {
    projectId: 'proj_1',
    runs: [
      { id: 'run_a', status: 'reviewing', startedAt: null, finishedAt: '2026-07-12T00:00:00.000Z' },
      { id: 'run_b', status: 'output', startedAt: null, finishedAt: '2026-07-18T00:00:00.000Z' },
      { id: 'run_c', status: 'reviewing', startedAt: '2026-10-06T00:00:00.000Z', finishedAt: '2026-10-06T00:10:00.000Z' },
      { id: 'run_x', status: 'failed', startedAt: '2026-10-07T00:00:00.000Z', finishedAt: null },
    ],
    findings: [f('a1', 'run_a', 'fp_1'), f('a2', 'run_a', 'fp_2'), f('b1', 'run_b', 'fp_1'), f('c1', 'run_c', 'fp_1'), f('c3', 'run_c', 'fp_3')],
    recommendations: [{ id: 'rb1', runId: 'run_b', findingId: 'b1', status: 'accepted', appliedAt: null, appliedNote: null }],
    newIssueId: () => `iss_${++i}`,
    newEventId: () => `iev_${++e}`,
    ...over,
  }
}

describe('replayHistory', () => {
  it('每个指纹一个问题；失败的体检不重放', () => {
    const out = replayHistory(input())
    expect(out.issues.map((x) => x.fingerprint).sort()).toEqual(['fp_1', 'fp_2', 'fp_3'])
    expect(out.events.every((ev) => ev.runId !== 'run_x')).toBe(true)
  })

  it('旧体检没台账：没再出现的问题记未复查（history_no_ledger），不会判已修复', () => {
    const fp2 = replayHistory(input()).issues.find((x) => x.fingerprint === 'fp_2')!
    expect(fp2).toMatchObject({ status: 'pending', detection: 'present', flags: ['unverified'], unverifiedReason: 'history_no_ledger' })
    expect(replayHistory(input()).issues.some((x) => x.status === 'fixed')).toBe(false)
  })

  it('7 月接受过的建议 → 问题已纳入，之后体检里的待确认不撤销它', () => {
    const fp1 = replayHistory(input()).issues.find((x) => x.fingerprint === 'fp_1')!
    expect(fp1).toMatchObject({ decision: 'included', decidedAt: '2026-07-18T00:00:00.000Z', decidedBy: 'operator', status: 'to_execute' })
  })

  it('否决 → 暂不处理（固定理由）；忽略的发现 → 误报（理由取忽略原因），误报优先', () => {
    const out = replayHistory(input({
      findings: [f('a1', 'run_a', 'fp_1', { status: 'dismissed', dismissReason: '品牌站首页可以这样写' }), f('a2', 'run_a', 'fp_2')],
      recommendations: [
        { id: 'ra1', runId: 'run_a', findingId: 'a1', status: 'rejected', appliedAt: null, appliedNote: null },
        { id: 'ra2', runId: 'run_a', findingId: 'a2', status: 'rejected', appliedAt: null, appliedNote: null },
      ],
    }))
    const by = Object.fromEntries(out.issues.map((x) => [x.fingerprint, x]))
    expect(by.fp_1).toMatchObject({ decision: 'false_positive', decisionReason: '品牌站首页可以这样写', status: 'excluded' })
    expect(by.fp_2).toMatchObject({ decision: 'deferred', decisionReason: '历史数据：否决时未记录理由' })
  })

  it('已纳入且标过执行 → 执行时间取 applied_at', () => {
    const out = replayHistory(input({
      recommendations: [{ id: 'rb1', runId: 'run_b', findingId: 'b1', status: 'accepted', appliedAt: '2026-07-20T00:00:00.000Z', appliedNote: '已改' }],
    }))
    expect(out.issues.find((x) => x.fingerprint === 'fp_1')).toMatchObject({ executedAt: '2026-07-20T00:00:00.000Z', executedNote: '已改', status: 'not_effective' })
  })

  it('回放结果确定：两次回放结构相同', () => {
    const strip = (o: ReturnType<typeof replayHistory>) => o.issues.map((x) => [x.fingerprint, x.status, x.decision, x.flags.join(',')]).sort()
    expect(strip(replayHistory(input()))).toEqual(strip(replayHistory(input())))
  })
})
