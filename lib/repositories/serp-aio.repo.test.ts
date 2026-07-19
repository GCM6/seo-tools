import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-serpaiorepo.db'
process.env.LIBSQL_URL = `file:${TEST_DB}` // 必须在 import 仓库/client 前设置。

// fresh sqlite 无表，drizzle 不自动建表：在 import @/db/client 前把 migration 全量按序灌进临时库
// （含 0010——验证 evidence_type CHECK 约束真的接受了新增的 'serp_aio' 值，不只是 TS 类型层面）。
rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
const migrations = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()
for (const m of migrations) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()

afterAll(() => rmSync(TEST_DB, { force: true }))

const repo = await import('./index')
const { db } = await import('@/db/client')
const { projects, runs, evidenceArtifacts, serpAioResults } = await import('@/db/schema')

async function seed() {
  await db.delete(serpAioResults)
  await db.delete(evidenceArtifacts)
  await db.delete(runs)
  await db.delete(projects)
  await db.insert(projects).values({ id: 'proj_1', domain: 'example.com' })
  await db.insert(runs).values({ id: 'run_1', projectId: 'proj_1' })
}

describe('serp_aio_results 仓库（AIO 实测落库）', () => {
  beforeEach(seed)

  it('evidence_artifacts 接受 type=serp_aio（CHECK 约束已放行新值，migration 0010 生效）', async () => {
    const [row] = await db
      .insert(evidenceArtifacts)
      .values({ id: 'ev_aio_1', projectId: 'proj_1', runId: 'run_1', type: 'serp_aio', claimLevel: 'L3', rawHash: 'h1' })
      .returning()
    expect(row.type).toBe('serp_aio')
  })

  it('createSerpAioResult 落库 + getRunSerpAioResults 按 runId 读回，字段原样往返', async () => {
    await db
      .insert(evidenceArtifacts)
      .values({ id: 'ev_aio_1', projectId: 'proj_1', runId: 'run_1', type: 'serp_aio', claimLevel: 'L3', rawHash: 'h1' })
    await repo.createSerpAioResult({
      id: 'saio_1',
      runId: 'run_1',
      evidenceId: 'ev_aio_1',
      keyword: 'best crm software',
      locationCode: 2840,
      languageCode: 'en',
      aioPresent: true,
      targetDomainCited: true,
      citedUrls: ['https://example.com/a'],
      rawAnswerHash: 'rah_1',
      parserVersion: 'v1',
    })

    const rows = await repo.getRunSerpAioResults('run_1')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'saio_1',
      runId: 'run_1',
      evidenceId: 'ev_aio_1',
      keyword: 'best crm software',
      locationCode: 2840,
      languageCode: 'en',
      aioPresent: true,
      targetDomainCited: true,
      citedUrls: ['https://example.com/a'],
      parserVersion: 'v1',
    })
  })

  it('getRunSerpAioResults 对无结果的 run 返回空数组', async () => {
    expect(await repo.getRunSerpAioResults('run_1')).toEqual([])
  })

  it('evidence_id 外键必须存在（关联 evidence_artifacts）', async () => {
    await expect(
      repo.createSerpAioResult({
        id: 'saio_bad',
        runId: 'run_1',
        evidenceId: 'ev_does_not_exist',
        keyword: 'x',
        locationCode: 2840,
        languageCode: 'en',
        aioPresent: false,
        targetDomainCited: false,
        citedUrls: [],
        rawAnswerHash: 'h',
        parserVersion: 'v1',
      }),
    ).rejects.toThrow()
  })
})
