import { describe, it, expect } from 'vitest'
import { backfillEventIds, replayHistory, type ReplayInput } from './backfill'
import { reconcileIssues, type ReconcileInput } from './reconcile'
import type { IssueRecord } from './types'

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

  it('只有建议自己是已接受 / 已修改时才算执行：待确认或已否决的建议带着 applied_at 不执行', () => {
    for (const status of ['draft', 'rejected']) {
      const out = replayHistory(input({
        recommendations: [
          { id: 'rb1', runId: 'run_b', findingId: 'b1', status: 'accepted', appliedAt: null, appliedNote: null },
          { id: 'rc1', runId: 'run_c', findingId: 'c1', status, appliedAt: '2026-10-07T00:00:00.000Z', appliedNote: '以前标过' },
        ],
      }))
      const fp1 = out.issues.find((x) => x.fingerprint === 'fp_1')!
      expect(fp1.executedAt, status).toBeNull()
      expect(out.events.some((ev) => ev.kind === 'execution'), status).toBe(false)
    }
    // 对照：同一条建议是已修改时照常执行。
    const edited = replayHistory(input({
      recommendations: [{ id: 'rb1', runId: 'run_b', findingId: 'b1', status: 'edited', appliedAt: '2026-07-20T00:00:00.000Z', appliedNote: null }],
    }))
    expect(edited.issues.find((x) => x.fingerprint === 'fp_1')!.executedAt).toBe('2026-07-20T00:00:00.000Z')
  })

  it('回放结果确定：两次回放结构相同', () => {
    const strip = (o: ReturnType<typeof replayHistory>) => o.issues.map((x) => [x.fingerprint, x.status, x.decision, x.flags.join(',')]).sort()
    expect(strip(replayHistory(input()))).toEqual(strip(replayHistory(input())))
  })

  it('回填出的问题规则版本一律记为未知（0）：历史观测出自 rules_v1…v10，当时的判定逻辑无从确认（含回放中再次命中的问题）', () => {
    const out = replayHistory(input())
    expect(out.issues.length).toBe(3)
    // fp_1 在三次体检里都命中，fp_2 只在第一次，fp_3 只在最后一次——都不能被记成本分支起点的版本 1。
    expect(out.issues.map((x) => [x.fingerprint, x.ruleVersion]).sort()).toEqual([['fp_1', 0], ['fp_2', 0], ['fp_3', 0]])
  })
})

describe('回填之后的第一次真实体检（spec 4.4-7：规则版本变了不算修复）', () => {
  // 7 月第一次体检命中 fp_2 且当时接受了建议 → 已纳入；之后的体检没再出现、也没有台账 → 未复查。
  const replayed = () => {
    const out = replayHistory(input({
      findings: [f('a1', 'run_a', 'fp_1'), f('a2', 'run_a', 'fp_2', { detail: { scale: { affected: 5 } } }), f('b1', 'run_b', 'fp_1'), f('c1', 'run_c', 'fp_1')],
      recommendations: [{ id: 'ra2', runId: 'run_a', findingId: 'a2', status: 'accepted', appliedAt: null, appliedNote: null }],
    }))
    return out.issues.find((x) => x.fingerprint === 'fp_2')!
  }
  const live = (pre: IssueRecord, over: Partial<ReconcileInput>) =>
    reconcileIssues({
      projectId: 'proj_1',
      run: { id: 'run_live', startedAt: '2026-10-20T00:00:00.000Z', protocolHash: 'P_live' },
      issues: [pre],
      hits: [],
      ledger: [{ ruleId: pre.ruleId, ruleVersion: 1, outcome: 'clear', reasonKind: null }],
      protocolBoundRuleIds: new Set(),
      missingLedger: 'retire',
      newIssueId: () => 'iss_unused',
      now: '2026-10-20T01:00:00.000Z',
      ...over,
    })

  it('前提：回放出的问题已纳入、最后一次命中在早期体检、之后记未复查（历史数据没有台账）', () => {
    expect(replayed()).toMatchObject({
      decision: 'included', status: 'to_execute', lastSeenRunId: 'run_a', affectedCount: 5, flags: ['unverified'], unverifiedReason: 'history_no_ledger',
    })
  })

  it('真实体检查过没命中 → 已关闭（规则已更新或历史版本未知），不判自行消失 / 已修复', () => {
    const out = live(replayed(), {})
    expect(out.issues).toHaveLength(1)
    const i = out.issues[0]
    expect(i).toMatchObject({ status: 'retired', retiredReason: 'rule_changed', flags: ['rule_changed'], decision: 'included', ruleVersion: 1 })
    expect(['self_resolved', 'fixed']).not.toContain(i.status)
    expect(out.events[0]).toMatchObject({ checked: true, hit: false, fromStatus: 'to_execute', toStatus: 'retired', note: 'rule_changed' })
  })

  it('真实体检仍命中 → 仍待执行（决定沿用），只标规则已更新；严重度与受影响数不与历史值比较', () => {
    const pre = replayed()
    const out = live(pre, {
      hits: [{ findingId: 'find_live', fingerprint: 'fp_2', ruleId: pre.ruleId, title: pre.title, pillar: pre.pillar, side: pre.side, severity: 'high', affectedCount: 2 }],
      ledger: [{ ruleId: pre.ruleId, ruleVersion: 1, outcome: 'hit', reasonKind: null }],
    })
    expect(out.issues).toHaveLength(1)
    const i = out.issues[0]
    expect(i).toMatchObject({ status: 'to_execute', decision: 'included', ruleVersion: 1, severity: 'high', affectedCount: 2 })
    expect(i.flags).toContain('rule_changed')
    expect(i.flags).not.toContain('worse')
    expect(i.flags).not.toContain('partial')
    expect(out.events[0].note).toBeNull()
  })
})

describe('backfillEventIds', () => {
  it('同一次回填里生成的事件 id 按生成顺序字典序递增（含 9 → 10、99 → 100 的进位）', () => {
    const next = backfillEventIds()
    const ids = Array.from({ length: 120 }, () => next())
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('iev_bf_'))).toBe(true)
  })

  it('两个生成器各自从头计数，但带随机后缀不会撞 id', () => {
    const a = backfillEventIds()
    const b = backfillEventIds()
    expect(a()).not.toBe(b())
  })
})
