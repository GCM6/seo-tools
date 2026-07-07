import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'

const TEST_DB = './veris-test-gsctoken.db'
process.env.LIBSQL_URL = `file:${TEST_DB}`
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64')

rmSync(TEST_DB, { force: true })
const bootstrap = createClient({ url: `file:${TEST_DB}` })
for (const m of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await bootstrap.executeMultiple(readFileSync(`db/migrations/${m}`, 'utf8'))
}
bootstrap.close()
afterAll(() => rmSync(TEST_DB, { force: true }))

const repo = await import('./index')
const { db } = await import('@/db/client')
const { projects, projectSettings } = await import('@/db/schema')
const { readGscToken } = await import('@/lib/gsc/token-crypto')

async function seedProject() {
  await db.delete(projectSettings)
  await db.delete(projects)
  await db.insert(projects).values({ id: 'proj_1', domain: 'example.com' })
  await db.insert(projectSettings).values({ projectId: 'proj_1' })
}

describe('GSC refresh_token 加密存储', () => {
  beforeEach(seedProject)

  it('setGscConnection 存密文（v1. 前缀、≠明文），读回可解密', async () => {
    await repo.setGscConnection('proj_1', { gscConnected: true, gscRefreshToken: 'refresh_tok' })
    const s = await repo.getProjectSettings('proj_1')
    expect(s!.gscRefreshToken!.startsWith('v1.')).toBe(true)
    expect(s!.gscRefreshToken).not.toContain('refresh_tok')
    expect(readGscToken(s!.gscRefreshToken)).toBe('refresh_tok')
  })

  it('gscRefreshToken 省略时不动该列（如仅更新连接态场景）', async () => {
    await repo.setGscConnection('proj_1', { gscConnected: true, gscRefreshToken: 'tok1' })
    await repo.setGscConnection('proj_1', { gscConnected: true })
    const s = await repo.getProjectSettings('proj_1')
    expect(readGscToken(s!.gscRefreshToken)).toBe('tok1')
  })

  it('迁移存量明文行 → 密文，且幂等', async () => {
    await db.update(projectSettings).set({ gscRefreshToken: 'legacy-plain' }).where(eq(projectSettings.projectId, 'proj_1'))
    const r1 = await repo.migrateGscRefreshTokensToEncrypted()
    expect(r1.migrated).toBe(1)
    const s = await repo.getProjectSettings('proj_1')
    expect(s!.gscRefreshToken!.startsWith('v1.')).toBe(true)
    expect(readGscToken(s!.gscRefreshToken)).toBe('legacy-plain')
    const r2 = await repo.migrateGscRefreshTokensToEncrypted()
    expect(r2.migrated).toBe(0)
  })
})
