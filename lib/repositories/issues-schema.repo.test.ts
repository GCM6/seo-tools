import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-issues-schema.db'
process.env.LIBSQL_URL = `file:${TEST_DB}` // 必须在 import 仓库/client 前设置。

rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()
afterAll(() => rmSync(TEST_DB, { force: true }))

const { db } = await import('@/db/client')
const { projects, runs, findings, recommendations, generatedPrompts, issues, issueEvents, checkResults } = await import('@/db/schema')
const { eq } = await import('drizzle-orm')

const issueRow = (over: Record<string, unknown> = {}) => ({
  id: 'iss_1', projectId: 'proj_1', fingerprint: 'fp_1', ruleId: 'T01', ruleVersion: 1,
  side: 'technical', title: '入口页被 noindex', severity: 'high', detection: 'present', status: 'pending',
  ...over,
})

describe('0019 问题台账表', () => {
  beforeEach(async () => {
    await db.delete(projects)
    await db.insert(projects).values({ id: 'proj_1', domain: 'https://example.com/' })
    await db.insert(runs).values({ id: 'run_1', projectId: 'proj_1' })
    await db.insert(findings).values({ id: 'find_1', runId: 'run_1', side: 'technical', title: 't', claimType: 'measured_hard', evidenceRefs: ['ev_1'] })
  })

  it('同一项目同一指纹只能有一个问题', async () => {
    await db.insert(issues).values(issueRow())
    await expect(db.insert(issues).values(issueRow({ id: 'iss_2' }))).rejects.toThrow()
  })

  it('暂不处理与误报必须写理由', async () => {
    await expect(db.insert(issues).values(issueRow({ decision: 'deferred', status: 'excluded' }))).rejects.toThrow()
    await expect(db.insert(issues).values(issueRow({ decision: 'false_positive', decisionReason: '  ', status: 'excluded' }))).rejects.toThrow()
    await db.insert(issues).values(issueRow({ decision: 'deferred', decisionReason: '先做 Google', status: 'excluded' }))
  })

  it('只有已纳入的问题能有执行时间', async () => {
    await expect(db.insert(issues).values(issueRow({ executedAt: '2026-10-09T00:00:00.000Z' }))).rejects.toThrow()
    await db.insert(issues).values(issueRow({ decision: 'included', executedAt: '2026-10-09T00:00:00.000Z', status: 'executed_awaiting' }))
  })

  it('检测值只接受 present / gone', async () => {
    await expect(db.insert(issues).values(issueRow({ detection: 'unverified' }))).rejects.toThrow()
  })

  it('删项目级联删问题、变化记录与台账', async () => {
    await db.insert(issues).values(issueRow())
    await db.insert(issueEvents).values({ id: 'iev_1', issueId: 'iss_1', runId: 'run_1', kind: 'observed', toStatus: 'pending', actor: 'system' })
    await db.insert(checkResults).values({ id: 'chk_1', runId: 'run_1', ruleId: 'T01', ruleVersion: 1, outcome: 'hit', hitCount: 1 })
    await db.delete(projects).where(eq(projects.id, 'proj_1'))
    expect(await db.select().from(issues)).toHaveLength(0)
    expect(await db.select().from(issueEvents)).toHaveLength(0)
    expect(await db.select().from(checkResults)).toHaveLength(0)
  })

  it('删体检：台账级联删除，变化记录与问题上的体检引用置空', async () => {
    await db.insert(issues).values(issueRow({ firstSeenRunId: 'run_1', lastSeenRunId: 'run_1', lastCheckedRunId: 'run_1', latestFindingId: 'find_1' }))
    await db.insert(issueEvents).values({ id: 'iev_1', issueId: 'iss_1', runId: 'run_1', kind: 'observed', toStatus: 'pending', actor: 'system' })
    await db.insert(checkResults).values({ id: 'chk_1', runId: 'run_1', ruleId: 'T01', ruleVersion: 1, outcome: 'hit', hitCount: 1 })
    await db.delete(runs).where(eq(runs.id, 'run_1'))
    const [issue] = await db.select().from(issues)
    expect(issue.firstSeenRunId).toBeNull()
    expect(issue.lastSeenRunId).toBeNull()
    expect(issue.latestFindingId).toBeNull() // 发现随体检级联删除 → 置空
    expect((await db.select().from(issueEvents))[0].runId).toBeNull()
    expect(await db.select().from(checkResults)).toHaveLength(0)
  })

  it('台账：同一体检同一规则唯一；「没查」必须带原因类别', async () => {
    await db.insert(checkResults).values({ id: 'chk_1', runId: 'run_1', ruleId: 'T01', ruleVersion: 1, outcome: 'clear', hitCount: 0 })
    await expect(db.insert(checkResults).values({ id: 'chk_2', runId: 'run_1', ruleId: 'T01', ruleVersion: 1, outcome: 'clear', hitCount: 0 })).rejects.toThrow()
    await expect(db.insert(checkResults).values({ id: 'chk_3', runId: 'run_1', ruleId: 'T02', ruleVersion: 1, outcome: 'not_checked', hitCount: 0 })).rejects.toThrow()
  })

  it('删问题级联删它的执行提示词（generated_prompts.issue_id ON DELETE cascade）', async () => {
    await db.insert(issues).values(issueRow())
    await db.insert(recommendations).values({ id: 'rec_1', runId: 'run_1', findingId: 'find_1', what: 'w', evidenceRefs: ['ev_1'] })
    await db.insert(generatedPrompts).values({ id: 'gp_1', recommendationId: 'rec_1', issueId: 'iss_1', promptType: 'technical', promptText: 'p' })
    await db.delete(issues).where(eq(issues.id, 'iss_1'))
    expect(await db.select().from(generatedPrompts)).toHaveLength(0)
  })

  it('findings.detail 与 runs.protocol_hash 可读写', async () => {
    const detail = { scale: { affected: 2 }, rows: [{ url: 'https://example.com/a', field: 'aggregateRating', current: '缺失', expected: '补上' }], truncated: false }
    await db.update(findings).set({ detail }).where(eq(findings.id, 'find_1'))
    await db.update(runs).set({ protocolHash: 'h1' }).where(eq(runs.id, 'run_1'))
    expect((await db.select().from(findings))[0].detail).toEqual(detail)
    expect((await db.select().from(runs))[0].protocolHash).toBe('h1')
  })
})
