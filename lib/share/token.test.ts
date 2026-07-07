import { describe, it, expect } from 'vitest'
import { generateShareToken } from './token'

describe('generateShareToken', () => {
  it('只含 urlsafe 字符（base64url：A-Z a-z 0-9 - _）', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateShareToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('足够长（≥ 22 字符，抗猜测）', () => {
    expect(generateShareToken().length).toBeGreaterThanOrEqual(22)
  })

  it('高熵：多次生成互不相同', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateShareToken()))
    expect(set.size).toBe(200)
  })
})
