import { describe, it, expect, beforeAll } from 'vitest'
import { encryptGscToken, readGscToken } from './token-crypto'

beforeAll(() => { process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64') })

describe('GSC token 加密辅助', () => {
  it('encrypt→read 往返还原', () => {
    expect(readGscToken(encryptGscToken('refresh_tok'))).toBe('refresh_tok')
  })
  it('密文带 v1. 前缀且不含明文', () => {
    const c = encryptGscToken('refresh_tok')
    expect(c.startsWith('v1.')).toBe(true)
    expect(c).not.toContain('refresh_tok')
  })
  it('legacy 明文（非 v1.）原样透传', () => {
    expect(readGscToken('plain-legacy')).toBe('plain-legacy')
  })
  it('null/空 → null', () => {
    expect(readGscToken(null)).toBeNull()
    expect(readGscToken('')).toBeNull()
  })
  it('v1. 但损坏 → null（不抛）', () => {
    expect(readGscToken('v1.bad.bad.bad')).toBeNull()
  })
})
