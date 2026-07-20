import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-keywordsrepo.db'
process.env.LIBSQL_URL = `file:${TEST_DB}` // 必须在 import 仓库/client 前设置。

// fresh sqlite 无表，drizzle 不自动建表：在 import @/db/client 前把 migration 全量按序灌进临时库。
rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
const migrations = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()
for (const m of migrations) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()

afterAll(() => rmSync(TEST_DB, { force: true }))

// schema 灌好后再 import，@/db/client 才会绑到已建表的临时库。
const repo = await import('./index')
const { db } = await import('@/db/client')
const { projects, runs, evidenceArtifacts, keywords, keywordMetrics, keywordGaps } = await import('@/db/schema')

async function seed() {
  await db.delete(keywordGaps)
  await db.delete(keywordMetrics)
  await db.delete(keywords)
  await db.delete(evidenceArtifacts)
  await db.delete(runs)
  await db.delete(projects)
  await db.insert(projects).values({ id: 'proj_1', domain: 'example.com' })
  await db.insert(runs).values({ id: 'run_1', projectId: 'proj_1' })
  await db.insert(evidenceArtifacts).values({
    id: 'ev_1', projectId: 'proj_1', runId: 'run_1', type: 'gsc', claimLevel: 'L4', rawHash: 'h1',
  })
  await db.insert(keywords).values([
    { id: 'kw_low', projectId: 'proj_1', text: '低点击词', searchVolume: 500 },
    { id: 'kw_mid', projectId: 'proj_1', text: '中点击词', searchVolume: 9000 },
    { id: 'kw_high', projectId: 'proj_1', text: '高点击词', searchVolume: 100 },
    { id: 'kw_null', projectId: 'proj_1', text: '空指标词', searchVolume: null },
  ])
}

describe('getRunKeywordMetrics — P1-8 默认序=clicks 降序、次级 impressions 降序', () => {
  beforeEach(seed)

  it('按 clicks 降序返回；clicks 为 null 排最后', async () => {
    await db.insert(keywordMetrics).values([
      { id: 'km_low', runId: 'run_1', keywordId: 'kw_low', source: 'gsc', clicks: 3, impressions: 300 },
      { id: 'km_high', runId: 'run_1', keywordId: 'kw_high', source: 'gsc', clicks: 50, impressions: 900 },
      { id: 'km_null', runId: 'run_1', keywordId: 'kw_null', source: 'gsc', clicks: null, impressions: null },
      { id: 'km_mid', runId: 'run_1', keywordId: 'kw_mid', source: 'gsc', clicks: 12, impressions: 400 },
    ])
    const rows = await repo.getRunKeywordMetrics('run_1')
    expect(rows.map((r) => r.id)).toEqual(['km_high', 'km_mid', 'km_low', 'km_null'])
  })

  it('clicks 相同时按 impressions 降序（次级键）', async () => {
    await db.insert(keywordMetrics).values([
      { id: 'km_a', runId: 'run_1', keywordId: 'kw_low', source: 'gsc', clicks: 10, impressions: 100 },
      { id: 'km_b', runId: 'run_1', keywordId: 'kw_high', source: 'gsc', clicks: 10, impressions: 900 },
    ])
    const rows = await repo.getRunKeywordMetrics('run_1')
    expect(rows.map((r) => r.id)).toEqual(['km_b', 'km_a'])
  })
})

describe('getRunKeywordGaps — P1-8 默认序=opportunityScore 降序、次级 volume 降序', () => {
  beforeEach(seed)

  it('按 opportunityScore 数值降序返回（非字典序：两位数不会排到个位数后面）', async () => {
    await db.insert(keywordGaps).values([
      { id: 'kg_9', runId: 'run_1', keywordId: 'kw_low', gapType: 'missing', opportunityScore: '9', evidenceId: 'ev_1' },
      { id: 'kg_10', runId: 'run_1', keywordId: 'kw_high', gapType: 'missing', opportunityScore: '10', evidenceId: 'ev_1' },
      { id: 'kg_85', runId: 'run_1', keywordId: 'kw_mid', gapType: 'weak', opportunityScore: '85.5', evidenceId: 'ev_1' },
    ])
    const rows = await repo.getRunKeywordGaps('run_1')
    expect(rows.map((r) => r.id)).toEqual(['kg_85', 'kg_10', 'kg_9'])
  })

  it('opportunityScore 相同时按关联 keyword 的 searchVolume 降序（次级键）', async () => {
    await db.insert(keywordGaps).values([
      { id: 'kg_a', runId: 'run_1', keywordId: 'kw_low', gapType: 'missing', opportunityScore: '50', evidenceId: 'ev_1' }, // volume 500
      { id: 'kg_b', runId: 'run_1', keywordId: 'kw_mid', gapType: 'missing', opportunityScore: '50', evidenceId: 'ev_1' }, // volume 9000
    ])
    const rows = await repo.getRunKeywordGaps('run_1')
    expect(rows.map((r) => r.id)).toEqual(['kg_b', 'kg_a'])
  })

  it('返回形状仍是扁平 keywordGaps 行（不因 join 排序而带出 keywords 表字段）', async () => {
    await db.insert(keywordGaps).values({
      id: 'kg_shape', runId: 'run_1', keywordId: 'kw_low', gapType: 'missing', opportunityScore: '50', evidenceId: 'ev_1',
    })
    const [row] = await repo.getRunKeywordGaps('run_1')
    expect(row).toMatchObject({ id: 'kg_shape', runId: 'run_1', keywordId: 'kw_low', gapType: 'missing' })
    expect(row).not.toHaveProperty('searchVolume')
    expect(row).not.toHaveProperty('text')
  })
})
