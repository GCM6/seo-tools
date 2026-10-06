import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { packRaw, unpackRaw } from './raw-store'
import { sha256Hex } from './hash'

const raw = (body: string) => ({ status: 200, contentType: 'application/json', body })

describe('packRaw / unpackRaw（SP-A §4.3 原始响应压缩存储）', () => {
  it('1MB JSON：压缩后可原样还原；byteLength 为原文字节数；sha256 为原文哈希', () => {
    const body = JSON.stringify({ items: Array.from({ length: 20000 }, (_, i) => ({ i, title: `result ${i}` })) })
    const packed = packRaw(raw(body))
    expect(packed.truncated).toBe(false)
    expect(packed.byteLength).toBe(Buffer.byteLength(body, 'utf8'))
    expect(packed.sha256).toBe(sha256Hex(body))
    expect(packed.content.length).toBeLessThan(packed.byteLength)
    expect(unpackRaw(packed.content)).toBe(body)
  })

  it('非 ASCII 原文可原样还原', () => {
    const body = 'ü—中文'.repeat(1000)
    expect(unpackRaw(packRaw(raw(body)).content)).toBe(body)
  })

  it('压缩后仍超上限：截断原文前缀并标 truncated，压缩体不超上限，sha256 仍是完整原文的哈希', () => {
    const body = randomBytes(300_000).toString('base64') // 不可压缩
    const cap = 64 * 1024
    const packed = packRaw(raw(body), cap)
    expect(packed.truncated).toBe(true)
    expect(packed.content.length).toBeLessThanOrEqual(cap)
    expect(packed.sha256).toBe(sha256Hex(body))
    expect(packed.byteLength).toBe(Buffer.byteLength(body, 'utf8'))
    const restored = unpackRaw(packed.content)
    expect(body.startsWith(restored)).toBe(true)
    expect(restored.length).toBeGreaterThan(0)
  })

  it('空 body 也能打包/还原', () => {
    const packed = packRaw(raw(''))
    expect(packed).toMatchObject({ byteLength: 0, truncated: false })
    expect(unpackRaw(packed.content)).toBe('')
  })
})
