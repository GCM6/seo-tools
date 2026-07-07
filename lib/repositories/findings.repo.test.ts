import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-findingsrepo.db'
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
const { projects, runs, evidenceArtifacts, findings } = await import('@/db/schema')

// 前置证据：4 档 claim_level 各一条，供 finding 引用。type 取白名单内的 'gsc'。
async function seed() {
  await db.delete(findings)
  await db.delete(evidenceArtifacts)
  await db.delete(runs)
  await db.delete(projects)
  await db.insert(projects).values({ id: 'proj_1', domain: 'example.com' })
  await db.insert(runs).values({ id: 'run_1', projectId: 'proj_1' })
  await db.insert(evidenceArtifacts).values([
    { id: 'ev_l1', projectId: 'proj_1', runId: 'run_1', type: 'gsc', claimLevel: 'L1', rawHash: 'h1' },
    { id: 'ev_l2', projectId: 'proj_1', runId: 'run_1', type: 'gsc', claimLevel: 'L2', rawHash: 'h2' },
    { id: 'ev_l3', projectId: 'proj_1', runId: 'run_1', type: 'gsc', claimLevel: 'L3', rawHash: 'h3' },
    { id: 'ev_l4', projectId: 'proj_1', runId: 'run_1', type: 'gsc', claimLevel: 'L4', rawHash: 'h4' },
  ])
}

// 构造 finding 插入行：side/title/claimType/evidenceRefs 必填，其余走列默认。
function findingRow(over: { id: string; claimType: string; evidenceRefs: string[] }) {
  return { runId: 'run_1', side: 'seo', title: 't', ...over }
}

describe('createFindings §6.2 claim-evidence 写路径约束', () => {
  beforeEach(seed)

  it('measured_hard 只引用 L2 证据 → 写入被拒', async () => {
    await expect(
      repo.createFindings([findingRow({ id: 'f_bad', claimType: 'measured_hard', evidenceRefs: ['ev_l2'] })]),
    ).rejects.toThrow(/L4/)
    // 拒绝须发生在任何插入之前：库里无该行。
    expect(await repo.getFindings('run_1')).toHaveLength(0)
  })

  it('measured_hard 引用 L4 证据 → 写入成功', async () => {
    const rows = await repo.createFindings([findingRow({ id: 'f_ok', claimType: 'measured_hard', evidenceRefs: ['ev_l4'] })])
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('f_ok')
  })

  it('measured_sample 只引用 L1 证据 → 写入被拒', async () => {
    await expect(
      repo.createFindings([findingRow({ id: 'f_s_bad', claimType: 'measured_sample', evidenceRefs: ['ev_l1'] })]),
    ).rejects.toThrow()
  })

  it('measured_sample 引用 L3 证据 → 写入成功', async () => {
    const rows = await repo.createFindings([findingRow({ id: 'f_s_ok', claimType: 'measured_sample', evidenceRefs: ['ev_l3'] })])
    expect(rows).toHaveLength(1)
  })

  it('hypothesis / inferred 不受证据等级约束（引用 L1 亦可入库）', async () => {
    const rows = await repo.createFindings([
      findingRow({ id: 'f_h', claimType: 'hypothesis', evidenceRefs: ['ev_l1'] }),
      findingRow({ id: 'f_i', claimType: 'inferred', evidenceRefs: ['ev_l1'] }),
    ])
    expect(rows).toHaveLength(2)
  })

  it('混批中单行违规 → 整批被拒，无部分写入', async () => {
    await expect(
      repo.createFindings([
        findingRow({ id: 'f_good', claimType: 'measured_hard', evidenceRefs: ['ev_l4'] }),
        findingRow({ id: 'f_evil', claimType: 'measured_hard', evidenceRefs: ['ev_l2'] }),
      ]),
    ).rejects.toThrow()
    expect(await repo.getFindings('run_1')).toHaveLength(0)
  })

  it('空数组短路：返回 [] 且不查库', async () => {
    expect(await repo.createFindings([])).toEqual([])
  })
})
