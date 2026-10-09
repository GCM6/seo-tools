import { describe, it, expect } from 'vitest'
import { reconcileIssues, observedEventId, type ReconcileInput, type ObservedHit, type LedgerEntry } from './reconcile'
import type { IssueRecord } from './types'

const RUN = { id: 'run_2', startedAt: '2026-11-01T00:00:00.000Z', protocolHash: 'P1' }
const NOW = '2026-11-01T01:00:00.000Z'

const issue = (over: Partial<IssueRecord> = {}): IssueRecord => ({
  id: 'iss_1', projectId: 'proj_1', fingerprint: 'fp_1', ruleId: 'C05c', ruleVersion: 1, pillar: 'P2', side: 'seo',
  title: '不符合 Google 富媒体结果要求', severity: 'mid', affectedCount: 2, latestFindingId: 'find_old',
  decision: 'pending', decisionReason: null, decidedAt: null, decidedBy: null,
  executedAt: null, executedNote: null, executedBy: null,
  detection: 'present', status: 'pending', flags: [], unverifiedReason: null, retiredReason: null,
  protocolHash: 'P1', firstSeenRunId: 'run_1', lastSeenRunId: 'run_1', lastCheckedRunId: 'run_1',
  lastCheckedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
})
const hit = (over: Partial<ObservedHit> = {}): ObservedHit => ({
  findingId: 'find_new', fingerprint: 'fp_1', ruleId: 'C05c', title: '不符合 Google 富媒体结果要求', pillar: 'P2', side: 'seo', severity: 'mid', affectedCount: 2, ...over,
})
const led = (ruleId: string, outcome: LedgerEntry['outcome'], over: Partial<LedgerEntry> = {}): LedgerEntry => ({ ruleId, ruleVersion: 1, outcome, reasonKind: null, ...over })

const run = (over: Partial<ReconcileInput>) => {
  let n = 0
  return reconcileIssues({
    projectId: 'proj_1', run: RUN, issues: [], hits: [], ledger: [], protocolBoundRuleIds: new Set(['G05']),
    missingLedger: 'retire', newIssueId: () => `iss_new_${++n}`, now: NOW, ...over,
  })
}
const only = (out: ReturnType<typeof reconcileIssues>) => {
  expect(out.issues).toHaveLength(1)
  expect(out.events).toHaveLength(1)
  return { i: out.issues[0], e: out.events[0] }
}

describe('reconcileIssues', () => {
  it('只在本次命中里有 → 新建问题：待处理 + 新出现，首见/最近见/最近检查都是本次', () => {
    const { i, e } = only(run({ hits: [hit({ fingerprint: 'fp_9' })], ledger: [led('C05c', 'hit')] }))
    expect(i).toMatchObject({
      id: 'iss_new_1', fingerprint: 'fp_9', decision: 'pending', status: 'pending', detection: 'present', flags: ['new'],
      firstSeenRunId: 'run_2', lastSeenRunId: 'run_2', lastCheckedRunId: 'run_2', lastCheckedAt: RUN.startedAt, protocolHash: 'P1', latestFindingId: 'find_new',
    })
    expect(e).toMatchObject({ id: observedEventId('run_2', 'iss_new_1'), kind: 'observed', checked: true, hit: true, fromStatus: null, toStatus: 'pending', actor: 'system' })
  })

  it('只在问题表里有、规则查过且没命中 → 没了：待处理变自行消失', () => {
    const { i, e } = only(run({ issues: [issue()], ledger: [led('C05c', 'clear')] }))
    expect(i).toMatchObject({ detection: 'gone', status: 'self_resolved', lastCheckedRunId: 'run_2', lastCheckedAt: RUN.startedAt, flags: [] })
    expect(e).toMatchObject({ checked: true, hit: false, fromStatus: 'pending', toStatus: 'self_resolved' })
  })

  it('两边都有、严重度上升 → 变严重；受影响数下降 → 部分改善', () => {
    expect(only(run({ issues: [issue()], hits: [hit({ severity: 'high' })], ledger: [led('C05c', 'hit')] })).i.flags).toEqual(['worse'])
    expect(only(run({ issues: [issue()], hits: [hit({ affectedCount: 1 })], ledger: [led('C05c', 'hit')] })).i.flags).toEqual(['partial'])
  })

  it('已执行，执行后的体检仍命中 → 改了没生效；没命中 → 已修复', () => {
    const executed = issue({ decision: 'included', decidedBy: 'operator', executedAt: '2026-10-15T00:00:00.000Z', status: 'executed_awaiting' })
    expect(only(run({ issues: [executed], hits: [hit()], ledger: [led('C05c', 'hit')] })).i.status).toBe('not_effective')
    expect(only(run({ issues: [executed], ledger: [led('C05c', 'clear')] })).i.status).toBe('fixed')
  })

  it('执行时间晚于本次体检开始 → 仍是已执行待复查（Review Focus 2）', () => {
    const late = issue({ decision: 'included', executedAt: '2026-11-01T00:30:00.000Z', status: 'executed_awaiting' })
    expect(only(run({ issues: [late], ledger: [led('C05c', 'clear')] })).i.status).toBe('executed_awaiting')
  })

  it.each<[LedgerEntry, string]>([
    [led('C05c', 'not_checked', { reasonKind: 'data_gap' }), 'data_gap'],
    [led('C05c', 'not_checked', { reasonKind: 'site_condition' }), 'site_condition'],
    [led('C05c', 'not_checked', { reasonKind: 'unsupported' }), 'unsupported'],
    [led('C05c', 'error', { reasonKind: 'error' }), 'error'],
  ])('没查 / 出错（%j）→ 未复查，检测与检查时间都不动，状态不变（Review Focus 5）', (entry, reason) => {
    const executed = issue({ decision: 'included', executedAt: '2026-10-15T00:00:00.000Z', status: 'executed_awaiting' })
    const { i, e } = only(run({ issues: [executed], ledger: [entry] }))
    expect(i).toMatchObject({ detection: 'present', lastCheckedRunId: 'run_1', lastCheckedAt: '2026-10-01T00:00:00.000Z', status: 'executed_awaiting', flags: ['unverified'], unverifiedReason: reason })
    expect(e).toMatchObject({ checked: false, hit: false, note: reason })
  })

  it('规则版本变了且没命中 → 关闭（规则已更新），不算修复', () => {
    const { i } = only(run({ issues: [issue({ decision: 'included' })], ledger: [led('C05c', 'clear', { ruleVersion: 2 })] }))
    expect(i).toMatchObject({ status: 'retired', retiredReason: 'rule_changed', flags: ['rule_changed'], ruleVersion: 2 })
  })

  it('台账里没有这条规则（已下线）→ 关闭；历史回填模式 → 未复查 history_no_ledger', () => {
    expect(only(run({ issues: [issue()], ledger: [] })).i).toMatchObject({ status: 'retired', retiredReason: 'rule_changed' })
    expect(only(run({ issues: [issue()], ledger: [], missingLedger: 'history' })).i).toMatchObject({ status: 'pending', flags: ['unverified'], unverifiedReason: 'history_no_ledger' })
  })

  it('受协议约束的规则：协议变了且没命中 → 关闭（协议已变）；协议没变 → 正常判没了', () => {
    const ai = issue({ ruleId: 'G05', protocolHash: 'P0' })
    expect(only(run({ issues: [ai], ledger: [led('G05', 'clear')] })).i).toMatchObject({ status: 'retired', retiredReason: 'protocol_changed', protocolHash: 'P1' })
    expect(only(run({ issues: [issue({ ruleId: 'G05' })], ledger: [led('G05', 'clear')] })).i.status).toBe('self_resolved')
  })

  it('不受协议约束的规则换协议照常比较', () => {
    expect(only(run({ issues: [issue({ protocolHash: 'P0' })], ledger: [led('C05c', 'clear')] })).i.status).toBe('self_resolved')
  })

  it('关闭的问题在新口径下再命中 → 新出现，已纳入的回到待执行（执行记录清空）', () => {
    const retired = issue({ decision: 'included', executedAt: '2026-10-15T00:00:00.000Z', retiredReason: 'rule_changed', status: 'retired' })
    const { i } = only(run({ issues: [retired], hits: [hit()], ledger: [led('C05c', 'hit')] }))
    expect(i).toMatchObject({ status: 'to_execute', retiredReason: null, executedAt: null, flags: ['new'] })
  })

  it('已修复的问题再命中 → 复发，回到待执行；待处理的自行消失再命中 → 复发，仍待处理', () => {
    const fixed = issue({ decision: 'included', executedAt: '2026-10-15T00:00:00.000Z', detection: 'gone', status: 'fixed', lastCheckedAt: '2026-10-20T00:00:00.000Z' })
    expect(only(run({ issues: [fixed], hits: [hit()], ledger: [led('C05c', 'hit')] })).i).toMatchObject({ status: 'to_execute', executedAt: null, flags: ['relapse'] })
    expect(only(run({ issues: [issue({ detection: 'gone', status: 'self_resolved' })], hits: [hit()], ledger: [led('C05c', 'hit')] })).i).toMatchObject({ status: 'pending', flags: ['relapse'] })
  })

  it('暂不处理的问题变严重 → 退回待处理；误报变严重 → 仍排除', () => {
    const deferred = issue({ decision: 'deferred', decisionReason: '先做 Google', decidedBy: 'operator', status: 'excluded' })
    expect(only(run({ issues: [deferred], hits: [hit({ severity: 'high' })], ledger: [led('C05c', 'hit')] })).i).toMatchObject({ decision: 'pending', decisionReason: null, status: 'pending', flags: ['worse'] })
    const fp = issue({ decision: 'false_positive', decisionReason: '品牌站首页可以这样写', status: 'excluded' })
    expect(only(run({ issues: [fp], hits: [hit({ severity: 'high' })], ledger: [led('C05c', 'hit')] })).i).toMatchObject({ decision: 'false_positive', status: 'excluded', flags: ['worse'] })
  })

  it('排除优先：误报的问题遇到规则版本变化只加标记，仍是已排除（4.4-9）', () => {
    const fp = issue({ decision: 'false_positive', decisionReason: 'x', status: 'excluded' })
    expect(only(run({ issues: [fp], ledger: [led('C05c', 'clear', { ruleVersion: 2 })] })).i).toMatchObject({ status: 'excluded', flags: ['rule_changed'] })
  })

  it('同一指纹本次有多条命中 → 取最严重的一条', () => {
    const { i } = only(run({ hits: [hit({ severity: 'ok', findingId: 'f_a' }), hit({ severity: 'high', findingId: 'f_b' })], ledger: [led('C05c', 'hit')] }))
    expect(i).toMatchObject({ severity: 'high', latestFindingId: 'f_b' })
  })

  it('onlyRuleIds：只处理给定规则的问题与命中，其余原样不出现在输出里', () => {
    const out = run({
      issues: [issue(), issue({ id: 'iss_2', fingerprint: 'fp_2', ruleId: 'Q01' })],
      hits: [hit({ fingerprint: 'fp_3', ruleId: 'Q01' }), hit({ fingerprint: 'fp_4', ruleId: 'C05c' })],
      ledger: [led('Q01', 'hit'), led('C05c', 'clear')],
      onlyRuleIds: new Set(['Q01']),
    })
    expect(out.issues.map((i) => i.fingerprint).sort()).toEqual(['fp_2', 'fp_3'])
  })

  it('同一体检对同一问题的变化记录 id 固定（重算时覆盖，不叠加）', () => {
    expect(run({ issues: [issue()], ledger: [led('C05c', 'clear')] }).events[0].id).toBe('iev_obs_run_2_iss_1')
  })
})
