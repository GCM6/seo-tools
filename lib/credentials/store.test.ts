import { describe, it, expect, beforeAll } from 'vitest'
import { resolveCredential, resolveCredentials } from './store'
import { encryptSecret } from '@/lib/crypto/secrets'

beforeAll(() => { process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64') })
const noRow = async () => undefined

describe('resolveCredential DB>env 覆盖', () => {
  it('DB 有值 → 返回解密明文', async () => {
    const ciphertext = encryptSecret('sk-db')
    const v = await resolveCredential('OPENAI_API_KEY', { getRow: async () => ({ ciphertext }), env: {} })
    expect(v).toBe('sk-db')
  })
  it('DB 无值 → 回退 env', async () => {
    const v = await resolveCredential('OPENAI_API_KEY', { getRow: noRow, env: { OPENAI_API_KEY: 'sk-env' } })
    expect(v).toBe('sk-env')
  })
  it('DB、env 均无 → undefined', async () => {
    expect(await resolveCredential('OPENAI_API_KEY', { getRow: noRow, env: {} })).toBeUndefined()
  })
  it('解密失败 → 不抛，回退 env', async () => {
    const v = await resolveCredential('OPENAI_API_KEY', { getRow: async () => ({ ciphertext: 'v1.bad.bad.bad' }), env: { OPENAI_API_KEY: 'sk-env' } })
    expect(v).toBe('sk-env')
  })
  it('resolveCredentials 批量成映射', async () => {
    const map = await resolveCredentials(['A', 'B'], { getRow: noRow, env: { A: '1' } })
    expect(map).toEqual({ A: '1', B: undefined })
  })
})
