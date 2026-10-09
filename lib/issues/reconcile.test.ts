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
    expect(e).toMatchObject({ checked: false, hit: null, note: reason })
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

  describe('F1：复发要求问题此前是已修复 / 自行消失（4.4-5）', () => {
    it('改了之后、那次体检还在跑时才点的已执行：那次判没了仍是已执行待复查；下一次体检命中 → 改了没生效，执行记录保留，不算复发', () => {
      const next = { id: 'run_3', startedAt: '2026-11-01T02:00:00.000Z', protocolHash: 'P1' }
      const raced = issue({
        decision: 'included', decidedBy: 'operator', executedAt: '2026-11-01T00:30:00.000Z', executedNote: '改了标题', executedBy: 'operator',
        detection: 'gone', status: 'executed_awaiting', lastCheckedRunId: 'run_2', lastCheckedAt: '2026-11-01T00:00:00.000Z',
      })
      const { i } = only(run({ run: next, issues: [raced], hits: [hit()], ledger: [led('C05c', 'hit')] }))
      expect(i).toMatchObject({ status: 'not_effective', executedAt: '2026-11-01T00:30:00.000Z', executedNote: '改了标题', executedBy: 'operator', flags: [] })
    })

    it('暂不处理的问题此前判没了、再命中且严重度不变 → 仍是已排除，不加复发', () => {
      const d = issue({ decision: 'deferred', decisionReason: '先做 Google', decidedBy: 'operator', detection: 'gone', status: 'excluded' })
      expect(only(run({ issues: [d], hits: [hit()], ledger: [led('C05c', 'hit')] })).i).toMatchObject({ decision: 'deferred', decisionReason: '先做 Google', status: 'excluded', flags: [] })
    })
  })

  describe('F2：数值比较只在同一口径下进行（4.3、4.4-4/6/7/10/11）', () => {
    it('暂不处理 + 已关闭的问题在新口径下再命中且严重度更高 → 只算新出现，决定仍是暂不处理', () => {
      const d = issue({ decision: 'deferred', decisionReason: '先做 Google', decidedBy: 'operator', retiredReason: 'rule_changed', status: 'excluded' })
      expect(only(run({ issues: [d], hits: [hit({ severity: 'high' })], ledger: [led('C05c', 'hit')] })).i).toMatchObject({
        decision: 'deferred', decisionReason: '先做 Google', status: 'excluded', flags: ['new'],
      })
    })

    it('规则版本变了的命中：不比严重度与受影响数，只加规则已更新；暂不处理的决定不被退回', () => {
      const d = issue({ decision: 'deferred', decisionReason: '先做 Google', decidedBy: 'operator', status: 'excluded' })
      const { i } = only(run({ issues: [d], hits: [hit({ severity: 'high', affectedCount: 1 })], ledger: [led('C05c', 'hit', { ruleVersion: 2 })] }))
      expect(i).toMatchObject({ decision: 'deferred', decisionReason: '先做 Google', status: 'excluded', flags: ['rule_changed'], ruleVersion: 2, severity: 'high', affectedCount: 1 })
    })

    it('受协议约束的规则协议变了的命中：不比严重度与受影响数，只加协议已变，记录新协议指纹', () => {
      const ai = issue({ ruleId: 'G05', protocolHash: 'P0' })
      const { i } = only(run({ issues: [ai], hits: [hit({ ruleId: 'G05', severity: 'high', affectedCount: 1 })], ledger: [led('G05', 'hit')] }))
      expect(i).toMatchObject({ flags: ['protocol_changed'], protocolHash: 'P1', severity: 'high', affectedCount: 1 })
    })

    it('协议指纹两边都为空算同一口径，一边为空一边有值算变了（未知与已知不可比）', () => {
      const h = hit({ ruleId: 'G05', severity: 'high' })
      const nullRun = { id: 'run_2', startedAt: RUN.startedAt, protocolHash: null }
      expect(only(run({ run: nullRun, issues: [issue({ ruleId: 'G05', protocolHash: null })], hits: [h], ledger: [led('G05', 'hit')] })).i.flags).toEqual(['worse'])
      expect(only(run({ issues: [issue({ ruleId: 'G05', protocolHash: null })], hits: [h], ledger: [led('G05', 'hit')] })).i.flags).toEqual(['protocol_changed'])
    })

    it('同一口径下受影响数 5 → 2 → 部分改善，变化记录写「5 → 2」；其他命中的变化记录没有备注', () => {
      const out = only(run({ issues: [issue({ affectedCount: 5 })], hits: [hit({ affectedCount: 2 })], ledger: [led('C05c', 'hit')] }))
      expect(out.i.flags).toEqual(['partial'])
      expect(out.e.note).toBe('5 → 2')
      expect(only(run({ issues: [issue()], hits: [hit({ severity: 'high' })], ledger: [led('C05c', 'hit')] })).e.note).toBeNull()
    })

    it('受协议约束的规则协议与版本都变了且没命中 → 先认协议已变（5.1-3：协议先于版本）', () => {
      const ai = issue({ ruleId: 'G05', protocolHash: 'P0' })
      expect(only(run({ issues: [ai], ledger: [led('G05', 'clear', { ruleVersion: 2 })] })).i).toMatchObject({ status: 'retired', retiredReason: 'protocol_changed', flags: ['protocol_changed'] })
    })
  })

  describe('F3：同一次体检里，问题第一次被查过的观测为准（对账可重复执行）', () => {
    const issues = [
      issue(), // fp_1：命中且变严重
      issue({ id: 'iss_2', fingerprint: 'fp_2', ruleId: 'Q01' }), // 查过没命中 → gone
      issue({ id: 'iss_3', fingerprint: 'fp_3', ruleId: 'Q02' }), // 没查 → unverified
    ]
    const shared = {
      hits: [hit({ severity: 'high' }), hit({ fingerprint: 'fp_9' })],
      ledger: [led('C05c', 'hit'), led('Q01', 'clear'), led('Q02', 'not_checked', { reasonKind: 'data_gap' as const })],
    }

    it('对账两遍：第二遍只剩没查的那条，且它的变化记录与第一遍一致；查过的不重复观测、不重复新建', () => {
      const first = run({ issues, ...shared })
      expect(first.issues.map((i) => [i.fingerprint, i.flags])).toEqual([['fp_1', ['worse']], ['fp_2', []], ['fp_3', ['unverified']], ['fp_9', ['new']]])
      const second = run({ issues: first.issues, ...shared })
      expect(second.issues).toEqual(first.issues.filter((i) => i.id === 'iss_3'))
      expect(second.events).toEqual(first.events.filter((e) => e.issueId === 'iss_3'))
    })

    it('先没查、同一体检补查（局部对账）后命中 → 按补查前的状态观测：变严重，已查，来自补查前的状态', () => {
      const pre = issue({ severity: 'mid' })
      const first = run({ issues: [pre], ledger: [led('C05c', 'not_checked', { reasonKind: 'data_gap' })] })
      expect(first.issues[0]).toMatchObject({ flags: ['unverified'], lastCheckedRunId: 'run_1' })
      const second = run({ issues: first.issues, hits: [hit({ severity: 'high' })], ledger: [led('C05c', 'hit')], onlyRuleIds: new Set(['C05c']) })
      const { i, e } = only(second)
      expect(i).toMatchObject({ lastCheckedRunId: 'run_2', flags: ['worse'], severity: 'high' })
      expect(e).toMatchObject({ checked: true, hit: true, fromStatus: pre.status, toStatus: 'pending' })
    })
  })

  describe('F4：变化记录不声称没做过的检查（4.4-3、6.1、6.2）', () => {
    it('台账里没有这条规则而关闭 → 没评估：记未查（checked false、hit null），检查时间、协议、版本都不动', () => {
      const { i, e } = only(run({ issues: [issue({ protocolHash: 'P0' })], ledger: [] }))
      expect(i).toMatchObject({ status: 'retired', retiredReason: 'rule_changed', flags: ['rule_changed'], lastCheckedRunId: 'run_1', lastCheckedAt: '2026-10-01T00:00:00.000Z', protocolHash: 'P0', ruleVersion: 1 })
      expect(e).toMatchObject({ checked: false, hit: null, severity: null, affectedCount: null, note: 'rule_changed' })
    })

    it('历史回填没有台账 → 未复查，变化记录同样是 checked false、hit null', () => {
      const { e } = only(run({ issues: [issue()], ledger: [], missingLedger: 'history' }))
      expect(e).toMatchObject({ checked: false, hit: null, note: 'history_no_ledger' })
    })

    it('规则评估过后因版本 / 协议变了而关闭 → 仍是查过没命中：checked true、hit false，检查时间移到本次', () => {
      const byVersion = only(run({ issues: [issue()], ledger: [led('C05c', 'clear', { ruleVersion: 2 })] }))
      expect(byVersion.e).toMatchObject({ checked: true, hit: false, note: 'rule_changed' })
      expect(byVersion.i).toMatchObject({ lastCheckedRunId: 'run_2', lastCheckedAt: RUN.startedAt, ruleVersion: 2 })
      const byProtocol = only(run({ issues: [issue({ ruleId: 'G05', protocolHash: 'P0' })], ledger: [led('G05', 'clear')] }))
      expect(byProtocol.e).toMatchObject({ checked: true, hit: false, note: 'protocol_changed' })
      expect(byProtocol.i).toMatchObject({ lastCheckedRunId: 'run_2', lastCheckedAt: RUN.startedAt, protocolHash: 'P1' })
    })
  })

  describe('R2：规则已下线、问题早已因此关闭 → 没有新东西可观测，不产出记录', () => {
    it('第一遍把规则已下线的待执行问题关闭；同一次体检再对账一遍（同台账）→ 第二遍对它不产出问题行也不产出变化记录', () => {
      const first = run({ issues: [issue({ decision: 'included', decidedBy: 'operator', status: 'to_execute' })], ledger: [] })
      expect(first.issues[0]).toMatchObject({ status: 'retired', retiredReason: 'rule_changed' })
      expect(first.events[0]).toMatchObject({ fromStatus: 'to_execute', toStatus: 'retired', checked: false, hit: null })
      const second = run({ issues: first.issues, ledger: [] })
      expect(second.issues).toEqual([])
      expect(second.events).toEqual([])
    })

    it('早已因规则已更新而关闭的问题，在新的一次体检里规则仍不在台账 → 不产出记录（不再每次体检多一行）', () => {
      const retired = issue({ retiredReason: 'rule_changed', status: 'retired', flags: ['rule_changed'] })
      const out = run({ issues: [retired], ledger: [] })
      expect(out.issues).toEqual([])
      expect(out.events).toEqual([])
    })

    it('不在此列：因协议已变关闭的问题规则随后下线 → 仍关闭一次，记为规则已更新；历史回填模式不变；规则还在台账里命中 → 照常新出现', () => {
      const byProtocol = issue({ ruleId: 'G05', retiredReason: 'protocol_changed', status: 'retired', flags: ['protocol_changed'] })
      const { i, e } = only(run({ issues: [byProtocol], ledger: [] }))
      expect(i).toMatchObject({ status: 'retired', retiredReason: 'rule_changed', flags: ['rule_changed'] })
      expect(e).toMatchObject({ fromStatus: 'retired', toStatus: 'retired', checked: false, hit: null, note: 'rule_changed' })
      const byRule = issue({ retiredReason: 'rule_changed', status: 'retired', flags: ['rule_changed'] })
      expect(only(run({ issues: [byRule], ledger: [], missingLedger: 'history' })).i).toMatchObject({ flags: ['unverified'], unverifiedReason: 'history_no_ledger' })
      expect(only(run({ issues: [byRule], hits: [hit()], ledger: [led('C05c', 'hit')] })).i).toMatchObject({ retiredReason: null, flags: ['new'] })
    })
  })
})
