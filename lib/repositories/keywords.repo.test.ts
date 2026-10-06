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
const { projects, projectSettings, runs, evidenceArtifacts, keywords, keywordMetrics, keywordGaps } = await import('@/db/schema')

async function seed() {
  await db.delete(keywordGaps)
  await db.delete(keywordMetrics)
  await db.delete(keywords)
  await db.delete(evidenceArtifacts)
  await db.delete(runs)
  await db.delete(projectSettings)
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

describe('种子词来源（SP-A §3.3）：getGscKeywordHistory', () => {
  beforeEach(async () => {
    await seed()
    await db.insert(runs).values([
      { id: 'run_old', projectId: 'proj_1', startedAt: '2026-07-13T07:05:02.556Z' },
      { id: 'run_new', projectId: 'proj_1', startedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'run_nostart', projectId: 'proj_1', startedAt: null, finishedAt: '2026-08-15T00:00:00.000Z' },
    ])
    await db.insert(keywords).values([
      { id: 'kw_a', projectId: 'proj_1', text: 'remove author from word', source: 'gsc' },
      { id: 'kw_b', projectId: 'proj_1', text: 'remove metadata excel', source: 'gsc', createdAt: '2026-07-18 10:00:00' },
      { id: 'kw_c', projectId: 'proj_1', text: 'pdf metadata remover', source: 'gsc' },
      { id: 'kw_m1', projectId: 'proj_1', text: 'remove pdf metadata', source: 'manual', market: 'global-en' },
      { id: 'kw_m2', projectId: 'proj_1', text: 'clean document metadata', source: 'manual', market: 'global-en' },
    ])
    await db.insert(keywordMetrics).values([
      { id: 'km_a_old', runId: 'run_old', keywordId: 'kw_a', source: 'gsc' },
      { id: 'km_a_new', runId: 'run_new', keywordId: 'kw_a', source: 'gsc' },
      { id: 'km_c', runId: 'run_nostart', keywordId: 'kw_c', source: 'gsc' },
    ])
  })

  it('getGscKeywordHistory：取最近一次所属 run 的开始时间；无 started_at 用 finished_at；无指标回落 created_at（统一 ISO）', async () => {
    const hist = await repo.getGscKeywordHistory('proj_1')
    const byText = Object.fromEntries(hist.map((h) => [h.keyText, h.lastSeenAt]))
    expect(byText['remove author from word']).toBe('2026-09-01T00:00:00.000Z')
    expect(byText['pdf metadata remover']).toBe('2026-08-15T00:00:00.000Z')
    expect(byText['remove metadata excel']).toBe('2026-07-18T10:00:00.000Z')
    expect(byText).not.toHaveProperty('remove pdf metadata')
  })
})

describe('目标关键词（SP-A §3.3，审查 C1/I1）：存项目设置，不写关键词测量表', () => {
  beforeEach(async () => {
    await seed()
    await db.insert(projectSettings).values({ projectId: 'proj_1' })
    // 已有一条 GSC 词及其本轮指标——目标词与它同文同市场是常态。
    await db.insert(keywords).values({ id: 'kw_gsc', projectId: 'proj_1', text: 'remove pdf metadata', source: 'gsc', market: 'global-en' })
    await db.insert(keywordMetrics).values({ id: 'km_gsc', runId: 'run_1', keywordId: 'kw_gsc', source: 'gsc', clicks: 7, impressions: 120 })
  })
  const keywordIds = async () => (await db.select().from(keywords)).map((r) => r.id).sort()

  it('目标词与已有 GSC 词同文同市场：不报错、不增删关键词行、GSC 指标保留', async () => {
    const before = await keywordIds()
    await repo.setTargetKeywords('proj_1', ['remove pdf metadata', 'clean docx metadata'])
    expect(await repo.getTargetKeywords('proj_1')).toEqual(['remove pdf metadata', 'clean docx metadata'])
    expect(await keywordIds()).toEqual(before)
    expect(await db.select().from(keywordMetrics)).toHaveLength(1)
  })

  it('清空目标词不删除任何关键词行或指标', async () => {
    await repo.setTargetKeywords('proj_1', ['remove pdf metadata'])
    await repo.setTargetKeywords('proj_1', [])
    expect(await repo.getTargetKeywords('proj_1')).toEqual([])
    expect(await db.select().from(keywordMetrics)).toHaveLength(1)
    expect(await keywordIds()).toContain('kw_gsc')
  })

  it('去首尾空白、去重、丢空行；项目没有设置行时自动建行', async () => {
    await db.delete(projectSettings)
    await repo.setTargetKeywords('proj_1', ['  strip exif ', 'strip exif', ''])
    expect(await repo.getTargetKeywords('proj_1')).toEqual(['strip exif'])
  })

  it('没有设置行或未知项目 → []', async () => {
    expect(await repo.getTargetKeywords('proj_unknown')).toEqual([])
  })
})
