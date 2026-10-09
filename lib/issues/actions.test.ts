import { describe, it, expect } from 'vitest'
import { applyIssueAction } from './actions'
import type { IssueRecord } from './types'

const NOW = '2026-11-02T00:00:00.000Z'
const ctx = { actor: 'operator' as const, now: NOW, eventId: 'iev_x' }
const issue = (over: Partial<IssueRecord> = {}): IssueRecord => ({
  id: 'iss_1', projectId: 'proj_1', fingerprint: 'fp_1', ruleId: 'C05c', ruleVersion: 1, pillar: 'P2', side: 'seo', title: 't',
  severity: 'mid', affectedCount: 2, latestFindingId: null, decision: 'pending', decisionReason: null, decidedAt: null, decidedBy: null,
  executedAt: null, executedNote: null, executedBy: null, detection: 'present', status: 'pending', flags: ['new'],
  unverifiedReason: null, retiredReason: null, protocolHash: 'P1', firstSeenRunId: 'run_1', lastSeenRunId: 'run_1', lastCheckedRunId: 'run_1',
  lastCheckedAt: '2026-11-01T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...over,
})

describe('applyIssueAction', () => {
  it('纳入 → 待执行；记决定时间与人；变化记录为 decision', () => {
    const { issue: i, event } = applyIssueAction(issue(), { kind: 'include' }, ctx)
    expect(i).toMatchObject({ decision: 'included', decidedAt: NOW, decidedBy: 'operator', status: 'to_execute', updatedAt: NOW })
    expect(event).toMatchObject({ id: 'iev_x', kind: 'decision', runId: null, fromStatus: 'pending', toStatus: 'to_execute', actor: 'operator' })
  })

  it('暂不处理 / 误报必须写理由，理由进变化记录；会清掉执行记录', () => {
    expect(() => applyIssueAction(issue(), { kind: 'defer', reason: '  ' }, ctx)).toThrow('reason_required')
    const executed = issue({ decision: 'included', executedAt: '2026-11-01T12:00:00.000Z', status: 'executed_awaiting' })
    const { issue: i, event } = applyIssueAction(executed, { kind: 'false_positive', reason: '品牌站首页可以这样写' }, ctx)
    expect(i).toMatchObject({ decision: 'false_positive', decisionReason: '品牌站首页可以这样写', executedAt: null, status: 'excluded' })
    expect(event.note).toBe('品牌站首页可以这样写')
  })

  it('撤销排除 → 回到待处理；对未排除的问题撤销 → 报错', () => {
    expect(applyIssueAction(issue({ decision: 'deferred', decisionReason: 'x', status: 'excluded' }), { kind: 'reopen' }, ctx).issue).toMatchObject({ decision: 'pending', decisionReason: null, status: 'pending' })
    expect(() => applyIssueAction(issue(), { kind: 'reopen' }, ctx)).toThrow('not_excluded')
  })

  it('执行：只有已纳入的问题能执行 → 已执行待复查；备注去空白；变化记录为 execution', () => {
    expect(() => applyIssueAction(issue(), { kind: 'execute' }, ctx)).toThrow('not_included')
    const { issue: i, event } = applyIssueAction(issue({ decision: 'included', status: 'to_execute' }), { kind: 'execute', note: ' 已补 aggregateRating ' }, ctx)
    expect(i).toMatchObject({ executedAt: NOW, executedNote: '已补 aggregateRating', executedBy: 'operator', status: 'executed_awaiting' })
    expect(event).toMatchObject({ kind: 'execution', toStatus: 'executed_awaiting', note: '已补 aggregateRating' })
  })

  it('改了没生效后再标一次执行 → 新的执行时间，回到已执行待复查', () => {
    const ne = issue({ decision: 'included', executedAt: '2026-10-01T00:00:00.000Z', status: 'not_effective' })
    expect(applyIssueAction(ne, { kind: 'execute' }, ctx).issue).toMatchObject({ executedAt: NOW, status: 'executed_awaiting' })
  })

  it('撤销执行 → 回到待执行；没执行过 → 报错', () => {
    const ex = issue({ decision: 'included', executedAt: '2026-11-01T12:00:00.000Z', executedNote: 'n', executedBy: 'operator', status: 'executed_awaiting' })
    expect(applyIssueAction(ex, { kind: 'undo_execute' }, ctx).issue).toMatchObject({ executedAt: null, executedNote: null, executedBy: null, status: 'to_execute' })
    expect(() => applyIssueAction(issue({ decision: 'included' }), { kind: 'undo_execute' }, ctx)).toThrow('not_executed')
  })
})
