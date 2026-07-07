import { describe, it, expect, beforeAll } from 'vitest'
import { encryptSecret, decryptSecret } from './secrets'

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('secrets AES-256-GCM', () => {
  it('明文往返还原', () => {
    expect(decryptSecret(encryptSecret('sk-abc123'))).toBe('sk-abc123')
  })
  it('密文不含明文', () => {
    expect(encryptSecret('sk-secret-value')).not.toContain('sk-secret-value')
  })
  it('篡改密文段 → 认证失败', () => {
    const parts = encryptSecret('x').split('.')
    parts[3] = Buffer.from('tampered').toString('base64')
    expect(() => decryptSecret(parts.join('.'))).toThrow('secret_decrypt_failed')
  })
  it('版本前缀不对 → 拒绝', () => {
    expect(() => decryptSecret('v2.a.b.c')).toThrow('secret_decrypt_failed')
  })
  it('主密钥非法 → 抛 key invalid', () => {
    const saved = process.env.CREDENTIALS_ENCRYPTION_KEY
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'short'
    expect(() => encryptSecret('x')).toThrow('credentials_encryption_key_invalid')
    process.env.CREDENTIALS_ENCRYPTION_KEY = saved
  })
})
