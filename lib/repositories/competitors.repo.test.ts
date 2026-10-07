import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-competitorsrepo.db'
process.env.LIBSQL_URL = `file:${TEST_DB}` // 必须在 import 仓库/client 前设置。

rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()

afterAll(() => rmSync(TEST_DB, { force: true }))

const repo = await import('./index')
const { db } = await import('@/db/client')
const { projects, runs, evidenceArtifacts, competitors } = await import('@/db/schema')

async function seed() {
  await db.delete(competitors)
  await db.delete(evidenceArtifacts)
  await db.delete(runs)
  await db.delete(projects)
  await db.insert(projects).values({ id: 'proj_1', domain: 'https://example.com/' })
  await db.insert(runs).values([{ id: 'run_old', projectId: 'proj_1' }, { id: 'run_new', projectId: 'proj_1' }])
  await db.insert(evidenceArtifacts).values([
    { id: 'ev_old', projectId: 'proj_1', runId: 'run_old', type: 'dataforseo_serp', claimLevel: 'L3', rawHash: 'h1' },
    { id: 'ev_new', projectId: 'proj_1', runId: 'run_new', type: 'dataforseo_serp', claimLevel: 'L3', rawHash: 'h2' },
  ])
  await db.insert(competitors).values([
    { id: 'c_stale', projectId: 'proj_1', domain: 'everhour.com', status: 'candidate', evidenceId: 'ev_old' },
    { id: 'c_kept', projectId: 'proj_1', domain: 'metadata2go.com', status: 'candidate', evidenceId: 'ev_old' },
    { id: 'c_confirmed', projectId: 'proj_1', domain: 'groupdocs.app', status: 'confirmed', evidenceId: 'ev_old' },
    { id: 'c_dismissed', projectId: 'proj_1', domain: 'larksuite.com', status: 'dismissed', evidenceId: 'ev_old' },
  ])
}

const domains = async () => (await db.select().from(competitors)).map((c) => `${c.domain}:${c.status}`).sort()

describe('pruneCompetitorCandidates（验收新发现 1：旧品类留下的候选不再混进新候选）', () => {
  beforeEach(seed)

  it('只删不在本次保留集里的 candidate；confirmed / dismissed 一律不动', async () => {
    await repo.pruneCompetitorCandidates('proj_1', ['metadata2go.com'])
    expect(await domains()).toEqual(['groupdocs.app:confirmed', 'larksuite.com:dismissed', 'metadata2go.com:candidate'])
  })

  it('本次没有识别出任何候选 → 删掉全部旧 candidate，确认过 / 忽略过的保留', async () => {
    await repo.pruneCompetitorCandidates('proj_1', [])
    expect(await domains()).toEqual(['groupdocs.app:confirmed', 'larksuite.com:dismissed'])
  })

  it('只影响本项目', async () => {
    await db.insert(projects).values({ id: 'proj_2', domain: 'https://other.com/' })
    await db.insert(competitors).values({ id: 'c_other', projectId: 'proj_2', domain: 'everhour.com', status: 'candidate' })
    await repo.pruneCompetitorCandidates('proj_1', [])
    expect((await db.select().from(competitors)).some((c) => c.id === 'c_other')).toBe(true)
  })
})

describe('upsertCompetitor 再次识别', () => {
  beforeEach(seed)

  it('同域名再次识别 → 更新重合度、共享词数与证据引用（指向最新一轮），状态不变', async () => {
    await repo.upsertCompetitor({ id: 'c_x', projectId: 'proj_1', domain: 'groupdocs.app', overlapScore: '0.26', sharedKeywordsCount: 6, status: 'candidate', evidenceId: 'ev_new' })
    const row = (await db.select().from(competitors)).find((c) => c.domain === 'groupdocs.app')!
    expect(row).toMatchObject({ id: 'c_confirmed', status: 'confirmed', overlapScore: '0.26', sharedKeywordsCount: 6, evidenceId: 'ev_new' })
  })
})
