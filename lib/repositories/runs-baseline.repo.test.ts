import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-runsbaseline.db'
process.env.LIBSQL_URL = `file:${TEST_DB}` // 必须在 import 仓库/client 前设置。

rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
const columns = (await bootstrap.execute('pragma table_info(runs)')).rows.map((r) => String(r.name))
bootstrap.close()

afterAll(() => rmSync(TEST_DB, { force: true }))

const repo = await import('./index')
const { db } = await import('@/db/client')
const { projects, runs } = await import('@/db/schema')
const { eq } = await import('drizzle-orm')

// 回测基线持久化（验收新发现 5）：基线 id 原来只在首次派发的事件里，重试回测会丢；改为存在 runs 表。
describe('runs.baseline_run_id', () => {
  beforeEach(async () => {
    await db.delete(runs)
    await db.delete(projects)
    await db.insert(projects).values({ id: 'proj_1', domain: 'https://example.com/' })
    await db.insert(runs).values({ id: 'run_base', projectId: 'proj_1' })
    await db.insert(runs).values({ id: 'run_retest', projectId: 'proj_1', runType: 'retest', baselineRunId: 'run_base' })
  })

  it('迁移后 runs 表有 baseline_run_id 列', () => {
    expect(columns).toContain('baseline_run_id')
  })

  it('getRun 读得到回测的基线 id', async () => {
    expect((await repo.getRun('run_retest'))?.baselineRunId).toBe('run_base')
  })

  it('基线 run 被删除 → 回测的 baseline_run_id 置空，回测本身保留', async () => {
    await db.delete(runs).where(eq(runs.id, 'run_base'))
    const retest = await repo.getRun('run_retest')
    expect(retest).toBeTruthy()
    expect(retest?.baselineRunId).toBeNull()
  })
})
