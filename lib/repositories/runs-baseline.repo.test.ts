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
const { projects, runs, evidenceArtifacts } = await import('@/db/schema')
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

// 同协议体检沿用起点体检的种子词样本（spec 2026-10-09 §5.3）：读起点体检 seed_serp 证据记下的请求（含 seeds）。
describe('getRunSeedSerpRequests', () => {
  const seedRequest = {
    kind: 'seed_serp', locationCode: 2826, languageCode: 'en', seedCount: 2,
    seeds: [{ text: 'remove pdf metadata', source: 'manual' }, { text: 'clean document metadata', source: 'site_phrase' }],
  }
  const ev = (id: string, runId: string, type: string, request: unknown) =>
    ({ id, projectId: 'proj_1', runId, type, claimLevel: 'L3', request, rawHash: 'h' }) as typeof evidenceArtifacts.$inferInsert

  beforeEach(async () => {
    await db.delete(evidenceArtifacts)
    await db.delete(runs)
    await db.delete(projects)
    await db.insert(projects).values({ id: 'proj_1', domain: 'https://example.com/' })
    await db.insert(runs).values([{ id: 'run_base', projectId: 'proj_1' }, { id: 'run_other', projectId: 'proj_1' }])
    await db.insert(evidenceArtifacts).values([
      ev('ev_seed', 'run_base', 'dataforseo_serp', seedRequest),
      // 同类型的其他证据：品牌词 SERP、Bing 收录、竞品内容形态（没有 request）；Labs 是别的类型。
      ev('ev_brand', 'run_base', 'dataforseo_serp', { kind: 'brand_serp', brandQuery: 'example' }),
      ev('ev_bing', 'run_base', 'dataforseo_serp', { kind: 'bing_index', target: 'example.com' }),
      ev('ev_form', 'run_base', 'dataforseo_serp', null),
      ev('ev_labs', 'run_base', 'dataforseo_labs', { kind: 'keyword_data', locationCode: 2826, languageCode: 'en', keywordCount: 2 }),
      ev('ev_seed_other', 'run_other', 'dataforseo_serp', { ...seedRequest, seeds: [{ text: 'other run', source: 'gsc' }] }),
    ])
  })

  it('只返回该体检种子词 SERP 证据的请求，原样（种子顺序不变）', async () => {
    expect(await repo.getRunSeedSerpRequests('run_base')).toEqual([seedRequest])
  })

  it('该体检没有种子词 SERP 证据 → 空数组', async () => {
    await db.delete(evidenceArtifacts).where(eq(evidenceArtifacts.id, 'ev_seed'))
    expect(await repo.getRunSeedSerpRequests('run_base')).toEqual([])
    expect(await repo.getRunSeedSerpRequests('run_missing')).toEqual([])
  })
})
