import { describe, it, expect, beforeAll } from 'vitest'
import { resolveDataforseoCredentials } from './dataforseo'
import { resolveCredential } from './store'
import { encryptSecret } from '@/lib/crypto/secrets'

beforeAll(() => { process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64') })

// 走真实的 resolveCredential（DB 密文优先、env 回退），只替换数据来源。
const resolverFrom = (db: Record<string, string>, env: Record<string, string | undefined>) => (key: string) =>
  resolveCredential(key, { getRow: async (k) => (db[k] ? { ciphertext: encryptSecret(db[k]) } : undefined), env })

describe('resolveDataforseoCredentials（SP-A §4.6：主采集 / AIO / 预检 / 设置页共用）', () => {
  it('数据库有值时优先用数据库', async () => {
    const resolve = resolverFrom({ DATAFORSEO_LOGIN: 'db@example.com', DATAFORSEO_PASSWORD: 'db-pass' }, { DATAFORSEO_LOGIN: 'env@example.com', DATAFORSEO_PASSWORD: 'env-pass' })
    expect(await resolveDataforseoCredentials(resolve)).toEqual({ login: 'db@example.com', password: 'db-pass' })
  })
  it('数据库无值时回落 env', async () => {
    const resolve = resolverFrom({}, { DATAFORSEO_LOGIN: 'env@example.com', DATAFORSEO_PASSWORD: 'env-pass' })
    expect(await resolveDataforseoCredentials(resolve)).toEqual({ login: 'env@example.com', password: 'env-pass' })
  })
  it('缺任一项 → null（不拿半套凭据去发请求）', async () => {
    expect(await resolveDataforseoCredentials(resolverFrom({}, {}))).toBeNull()
    expect(await resolveDataforseoCredentials(resolverFrom({ DATAFORSEO_LOGIN: 'db@example.com' }, {}))).toBeNull()
  })
})
