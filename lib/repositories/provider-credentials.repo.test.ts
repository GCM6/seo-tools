import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

const TEST_DB = './veris-test-credrepo.db'
process.env.LIBSQL_URL = `file:${TEST_DB}`
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')

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
const { providerCredentials } = await import('@/db/schema')

describe('provider_credentials 仓库', () => {
  beforeEach(async () => { await db.delete(providerCredentials) })

  it('setProviderCredential 存密文（≠明文）；getConfiguredCredentialKeys 列出键；解密可还原', async () => {
    await repo.setProviderCredential('OPENAI_API_KEY', 'sk-plain')
    const [row] = await db.select().from(providerCredentials)
    expect(row.ciphertext).not.toContain('sk-plain')
    expect(await repo.getConfiguredCredentialKeys()).toEqual(['OPENAI_API_KEY'])
    const got = await repo.getProviderCredentialRow('OPENAI_API_KEY')
    const { decryptSecret } = await import('@/lib/crypto/secrets')
    expect(decryptSecret(got!.ciphertext)).toBe('sk-plain')
  })

  it('upsert 同键覆盖，不新增行', async () => {
    await repo.setProviderCredential('OPENAI_API_KEY', 'v1')
    await repo.setProviderCredential('OPENAI_API_KEY', 'v2')
    expect(await db.select().from(providerCredentials)).toHaveLength(1)
  })

  it('deleteProviderCredential 移除', async () => {
    await repo.setProviderCredential('GEMINI_API_KEY', 'k')
    await repo.deleteProviderCredential('GEMINI_API_KEY')
    expect(await repo.getConfiguredCredentialKeys()).toEqual([])
  })
})
