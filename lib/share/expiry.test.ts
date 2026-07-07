import { describe, it, expect } from 'vitest'
import { isShareExpired } from './expiry'

const now = new Date('2026-07-07T12:00:00Z')

describe('isShareExpired', () => {
  it('null 过期时间 = 永不过期', () => {
    expect(isShareExpired(null, now)).toBe(false)
  })

  it('未来时间未过期', () => {
    expect(isShareExpired('2026-07-08T12:00:00Z', now)).toBe(false)
  })

  it('过去时间已过期', () => {
    expect(isShareExpired('2026-07-06T12:00:00Z', now)).toBe(true)
  })

  it('恰好当前时刻算已过期（含边界）', () => {
    expect(isShareExpired('2026-07-07T12:00:00Z', now)).toBe(true)
  })

  it('无法解析的时间视作已过期（保守拒绝）', () => {
    expect(isShareExpired('not-a-date', now)).toBe(true)
  })
})
