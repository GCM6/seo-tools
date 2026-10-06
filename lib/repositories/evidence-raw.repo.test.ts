import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-evidence-raw.db'
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
const { projects, runs, evidenceArtifacts, evidenceRaw } = await import('@/db/schema')
const { eq } = await import('drizzle-orm')
const { packRaw, unpackRaw } = await import('@/lib/collection/raw-store')

const body = JSON.stringify({ tasks: [{ status_code: 40101, status_message: 'Out of credits' }] })
const packed = packRaw({ status: 402, contentType: 'application/json', body })
const row = (id: string, runId = 'run_1') => ({
  id, runId, evidenceId: null, sourceKey: 'dataforseo:labs', httpStatus: 402, contentType: 'application/json', encoding: 'gzip' as const, ...packed,
})

beforeEach(async () => {
  await db.delete(evidenceRaw)
  await db.delete(evidenceArtifacts)
  await db.delete(runs)
  await db.delete(projects)
  await db.insert(projects).values({ id: 'proj_1', domain: 'https://example.com/' })
  await db.insert(runs).values([{ id: 'run_1', projectId: 'proj_1' }, { id: 'run_2', projectId: 'proj_1' }])
  await db.insert(evidenceArtifacts).values({ id: 'ev_1', projectId: 'proj_1', runId: 'run_1', type: 'dataforseo_labs', claimLevel: 'L3', rawHash: 'h' })
})

describe('evidence_raw 仓库（SP-A §4.3）', () => {
  it('失败响应先无证据落库，之后可挂到证据上；按证据 id 取回并原样解压', async () => {
    await repo.createEvidenceRaw(row('raw_1'))
    await repo.createEvidenceRaw(row('raw_1b'))
    await repo.linkEvidenceRaw(['raw_1', 'raw_1b'], 'ev_1')
    // 一条证据可对应多次请求的原文（如种子 SERP 逐词请求）：按证据取回全部。
    const got = await repo.getEvidenceRawsByEvidenceId('ev_1')
    expect(got.map((r) => r.id).sort()).toEqual(['raw_1', 'raw_1b'])
    expect(unpackRaw(got[0].content)).toBe(body)
    expect(got[0]).toMatchObject({ httpStatus: 402, sha256: packed.sha256, truncated: false })
  })

  it('按 (runId, rawId) 取：run 不匹配则取不到（防跨 run 读取）', async () => {
    await repo.createEvidenceRaw(row('raw_2'))
    expect((await repo.getEvidenceRawById('run_1', 'raw_2'))?.id).toBe('raw_2')
    expect(await repo.getEvidenceRawById('run_2', 'raw_2')).toBeUndefined()
  })

  it('linkEvidenceRaw 空数组不报错（drizzle inArray([]) 短路）', async () => {
    await expect(repo.linkEvidenceRaw([], 'ev_1')).resolves.toBeUndefined()
  })

  it('删除 run 级联删除原始响应（删项目级联删用户数据铁律）', async () => {
    await repo.createEvidenceRaw(row('raw_3'))
    await db.delete(runs).where(eq(runs.id, 'run_1'))
    expect(await db.select().from(evidenceRaw)).toHaveLength(0)
  })
})
