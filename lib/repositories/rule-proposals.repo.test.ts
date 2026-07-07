import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-rulesrepo.db'
process.env.LIBSQL_URL = `file:${TEST_DB}` // 必须在 import 仓库/client 前设置。

// 把已提交的 migration SQL 全量按序灌进临时文件库（fresh sqlite 无表，drizzle 不自动建表）。
// 必须在 import @/db/client 之前灌好：client 在 import 时即 eager 打开该文件句柄，
// 若之后再 rmSync+重建会让 drizzle 句柄指向被 unlink 的空 inode（读不到表）。
// 直接遍历 db/migrations/*.sql（含 0002 补的 findings.rule_id / runs.rules_version），
// 无需手写 ALTER，新增迁移自动纳入。
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
const { ruleChangeProposals, referenceArtifacts } = await import('@/db/schema')

async function reset() {
  await db.delete(ruleChangeProposals)
  await db.delete(referenceArtifacts)
}

describe('createRuleChangeProposal', () => {
  beforeEach(reset)
  it('evidence 为空时抛错', () => {
    // 守卫在返回 promise 前同步抛出（无一手来源不入库），故用同步 toThrow 断言。
    expect(() =>
      repo.createRuleChangeProposal({
        id: 'rcp_1', source: 'manual', changeType: 'new_rule', target: 'X01', evidenceRefs: [], status: 'pending',
      }),
    ).toThrow('proposal_evidence_required')
  })
  it('evidence 非空时入库', async () => {
    const [row] = await repo.createRuleChangeProposal({
      id: 'rcp_2', source: 'manual', changeType: 'new_rule', target: 'X01', evidenceRefs: ['https://x'], status: 'pending',
    })
    expect(row.id).toBe('rcp_2')
  })
})

describe('releaseApprovedProposals', () => {
  beforeEach(reset)
  it('打包已批未发布提案 + 自动落地 update_artifact', async () => {
    await repo.upsertReferenceArtifact({ id: 'refart_k', artifactKey: 'k', version: 'v1', sourceUrl: 'https://s', refreshCadenceDays: 90 })
    await repo.createRuleChangeProposal({ id: 'rcp_a', source: 'scheduled_research', changeType: 'update_artifact', target: 'k', evidenceRefs: ['https://s'], status: 'pending' })
    await repo.setProposalStatus('rcp_a', 'approved')

    const res = await repo.releaseApprovedProposals('rules_v2')
    expect(res).toEqual({ released: 1, artifactsUpdated: 1 })

    const [art] = await repo.getReferenceArtifacts()
    expect(art.version).toBe('v2')
    expect(art.lastVerifiedAt).not.toBeNull()

    const released = await repo.getReleasedProposals()
    expect(released[0].releasedInRulesVersion).toBe('rules_v2')

    expect(await repo.getReleasedVersions()).toEqual(['rules_v2'])
  })

  it('重发已发布版本 / 降版发布被守卫拒绝', async () => {
    await repo.createRuleChangeProposal({ id: 'rcp_g1', source: 'manual', changeType: 'new_rule', target: 'X01', evidenceRefs: ['https://x'], status: 'pending' })
    await repo.setProposalStatus('rcp_g1', 'approved')
    await repo.releaseApprovedProposals('rules_v3')

    // 重发 v3（已发布）→ 抛；发布 v2（≤ 已发布最大 v3）→ 抛。
    await expect(repo.releaseApprovedProposals('rules_v3')).rejects.toThrow('rules_version_already_released')
    await expect(repo.releaseApprovedProposals('rules_v2')).rejects.toThrow('rules_version_not_monotonic')
  })
})
