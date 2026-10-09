import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = `./veris-test-issues-repo-${process.pid}.db`
process.env.LIBSQL_URL = `file:${TEST_DB}`
rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()
afterAll(() => rmSync(TEST_DB, { force: true }))

const repo = await import('./index')
const { db } = await import('@/db/client')
const { projects, runs, issueEvents, checkResults } = await import('@/db/schema')
import type { IssueRecord, IssueEventDraft } from '@/lib/issues/types'

const issue = (over: Partial<IssueRecord> = {}): IssueRecord => ({
  id: 'iss_1', projectId: 'proj_1', fingerprint: 'fp_1', ruleId: 'C05c', ruleVersion: 1, pillar: 'P2', side: 'seo', title: 't',
  severity: 'mid', affectedCount: 2, latestFindingId: null, decision: 'pending', decisionReason: null, decidedAt: null, decidedBy: null,
  executedAt: null, executedNote: null, executedBy: null, detection: 'present', status: 'pending', flags: ['new'],
  unverifiedReason: null, retiredReason: null, protocolHash: 'P1', firstSeenRunId: 'run_1', lastSeenRunId: 'run_1', lastCheckedRunId: 'run_1',
  lastCheckedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...over,
})
const ev = (over: Partial<IssueEventDraft> = {}): IssueEventDraft => ({
  id: 'iev_obs_run_1_iss_1', issueId: 'iss_1', runId: 'run_1', kind: 'observed', checked: true, hit: true, severity: 'mid', affectedCount: 2,
  fromStatus: null, toStatus: 'pending', flags: ['new'], note: null, actor: 'system', createdAt: '2026-10-01T00:00:00.000Z', ...over,
})

describe('问题仓储', () => {
  beforeEach(async () => {
    await db.delete(projects)
    await db.insert(projects).values({ id: 'proj_1', domain: 'https://example.com/' })
    await db.insert(runs).values({ id: 'run_1', projectId: 'proj_1' })
  })

  it('saveIssueChanges：首次插入，同 id 再存则更新；observed 记录按 id 覆盖不叠加', async () => {
    await repo.saveIssueChanges({ issues: [issue()], events: [ev()] })
    await repo.saveIssueChanges({ issues: [issue({ status: 'self_resolved', detection: 'gone', flags: [] })], events: [ev({ toStatus: 'self_resolved', hit: false })] })
    const got = await repo.getProjectIssues('proj_1')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ status: 'self_resolved', detection: 'gone', flags: [] })
    const events = await db.select().from(issueEvents)
    expect(events).toHaveLength(1)
    expect(events[0].toStatus).toBe('self_resolved')
  })

  it('saveIssueChanges 是单事务：任何一行违反约束则全部不写', async () => {
    await expect(repo.saveIssueChanges({ issues: [issue(), issue({ id: 'iss_2', fingerprint: 'fp_2', decision: 'deferred' })], events: [] })).rejects.toThrow()
    expect(await repo.getProjectIssues('proj_1')).toHaveLength(0)
  })

  it('getIssueByFingerprint / hasObservedEvents', async () => {
    expect(await repo.hasObservedEvents('run_1')).toBe(false)
    await repo.saveIssueChanges({ issues: [issue()], events: [ev()] })
    expect((await repo.getIssueByFingerprint('proj_1', 'fp_1'))?.id).toBe('iss_1')
    expect(await repo.hasObservedEvents('run_1')).toBe(true)
  })

  it('saveCheckLedger 按（体检, 规则）覆盖', async () => {
    await repo.saveCheckLedger('run_1', [{ ruleId: 'Q01', ruleVersion: 1, outcome: 'not_checked', reasonKind: 'data_gap', reason: '缺数据源：confirmed_competitors', hitCount: 0 }])
    await repo.saveCheckLedger('run_1', [{ ruleId: 'Q01', ruleVersion: 1, outcome: 'hit', reasonKind: null, reason: null, hitCount: 1 }])
    const rows = await db.select().from(checkResults)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ outcome: 'hit', reasonKind: null, hitCount: 1 })
    expect(String(rows[0].id)).toMatch(/^chk_/)
  })

  it('recomputeRetestDue：最早一条「已执行待复查」的执行时间 + 28 天；没有则清空', async () => {
    await repo.saveIssueChanges({
      issues: [
        issue({ decision: 'included', executedAt: '2026-10-05T00:00:00.000Z', status: 'executed_awaiting' }),
        issue({ id: 'iss_2', fingerprint: 'fp_2', decision: 'included', executedAt: '2026-10-01T00:00:00.000Z', status: 'executed_awaiting' }),
        issue({ id: 'iss_3', fingerprint: 'fp_3', decision: 'included', executedAt: '2026-09-01T00:00:00.000Z', status: 'fixed', detection: 'gone' }),
      ],
      events: [],
    })
    expect(await repo.recomputeRetestDue('proj_1')).toBe('2026-10-29T00:00:00.000Z')
    expect((await repo.getProject('proj_1'))?.nextRetestDueAt).toBe('2026-10-29T00:00:00.000Z')
    await repo.saveIssueChanges({ issues: [issue({ decision: 'included', executedAt: '2026-10-05T00:00:00.000Z', status: 'fixed', detection: 'gone' }), issue({ id: 'iss_2', fingerprint: 'fp_2', decision: 'included', executedAt: '2026-10-01T00:00:00.000Z', status: 'fixed', detection: 'gone' })], events: [] })
    expect(await repo.recomputeRetestDue('proj_1')).toBeNull()
    expect((await repo.getProject('proj_1'))?.nextRetestDueAt).toBeNull()
  })

  it('getRunIssueSummary：按状态计数，列出本次关闭的数量与原因，曾纳入的关闭问题逐条列出', async () => {
    await repo.saveIssueChanges({
      issues: [
        issue({ status: 'pending', flags: ['new'] }),
        issue({ id: 'iss_2', fingerprint: 'fp_2', decision: 'included', executedAt: '2026-09-01T00:00:00.000Z', status: 'retired', retiredReason: 'rule_changed', flags: ['rule_changed'], title: '缺推荐字段' }),
        issue({ id: 'iss_3', fingerprint: 'fp_3', status: 'retired', retiredReason: 'protocol_changed', flags: ['protocol_changed'] }),
      ],
      events: [
        ev(),
        ev({ id: 'iev_obs_run_1_iss_2', issueId: 'iss_2', fromStatus: 'executed_awaiting', toStatus: 'retired', hit: false, flags: ['rule_changed'], note: 'rule_changed' }),
        ev({ id: 'iev_obs_run_1_iss_3', issueId: 'iss_3', fromStatus: 'pending', toStatus: 'retired', hit: false, flags: ['protocol_changed'], note: 'protocol_changed' }),
      ],
    })
    const s = await repo.getRunIssueSummary('run_1')
    expect(s.total).toBe(3)
    expect(s.byStatus).toEqual({ pending: 1, retired: 2 })
    expect(s.newCount).toBe(1)
    expect(s.closed).toEqual({
      protocolChanged: 1,
      ruleChanged: 1,
      committed: [{ issueId: 'iss_2', title: '缺推荐字段', reason: 'rule_changed', executed: true }],
    })
  })

  it('getProjectIssueTodos：待处理（其中新出现 / 变严重）与改了没生效', async () => {
    await repo.saveIssueChanges({
      issues: [
        issue({ flags: ['new'] }),
        issue({ id: 'iss_2', fingerprint: 'fp_2', flags: ['worse'] }),
        issue({ id: 'iss_3', fingerprint: 'fp_3', decision: 'included', executedAt: '2026-09-01T00:00:00.000Z', status: 'not_effective', flags: [] }),
        issue({ id: 'iss_4', fingerprint: 'fp_4', decision: 'included', status: 'to_execute', flags: [] }),
      ],
      events: [],
    })
    expect(await repo.getProjectIssueTodos('proj_1')).toEqual({ pending: 2, pendingNew: 1, pendingWorse: 1, notEffective: 1 })
  })

  it('recomputeRetestDue：处理畸形 executedAt，比对编年顺序不按字符串', async () => {
    await repo.saveIssueChanges({
      issues: [
        issue({ id: 'iss_1', fingerprint: 'fp_1', decision: 'included', executedAt: 'not-a-date', status: 'executed_awaiting' }),
        issue({ id: 'iss_2', fingerprint: 'fp_2', decision: 'included', executedAt: '2026-10-05T00:00:00.000Z', status: 'executed_awaiting' }),
      ],
      events: [],
    })
    expect(await repo.recomputeRetestDue('proj_1')).toBe('2026-11-02T00:00:00.000Z')
    expect((await repo.getProject('proj_1'))?.nextRetestDueAt).toBe('2026-11-02T00:00:00.000Z')
  })

  it('recomputeRetestDue：仅畸形 executedAt 不抛错，返回 null', async () => {
    await repo.saveIssueChanges({
      issues: [
        issue({ decision: 'included', executedAt: 'not-a-date', status: 'executed_awaiting' }),
      ],
      events: [],
    })
    expect(await repo.recomputeRetestDue('proj_1')).toBeNull()
    expect((await repo.getProject('proj_1'))?.nextRetestDueAt).toBeNull()
  })

  it('issue_events：kind=decision 追加语义，同 id 重新保存不覆盖', async () => {
    await repo.saveIssueChanges({
      issues: [issue()],
      events: [
        {
          id: 'iev_dec_1', issueId: 'iss_1', runId: null, kind: 'decision', checked: null, hit: null,
          severity: null, affectedCount: null, fromStatus: null, toStatus: 'pending', flags: [], note: 'a',
          actor: 'operator', createdAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    })
    await repo.saveIssueChanges({
      issues: [],
      events: [
        {
          id: 'iev_dec_1', issueId: 'iss_1', runId: null, kind: 'decision', checked: null, hit: null,
          severity: null, affectedCount: null, fromStatus: null, toStatus: 'pending', flags: [], note: 'b',
          actor: 'operator', createdAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    })
    const events = await db.select().from(issueEvents)
    expect(events).toHaveLength(1)
    expect(events[0].note).toBe('a')
  })
})
