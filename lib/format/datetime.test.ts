import { describe, it, expect } from 'vitest'
import { formatLocalDateTime, runTimestamp } from './datetime'

describe('formatLocalDateTime', () => {
  it('按给定时区输出 YYYY-MM-DD HH:mm', () => {
    expect(formatLocalDateTime('2026-07-18T14:36:24.377Z', 'Asia/Shanghai')).toBe('2026-07-18 22:36')
    expect(formatLocalDateTime('2026-07-18T14:36:24.377Z', 'UTC')).toBe('2026-07-18 14:36')
  })

  it('跨日时日期随时区变化', () => {
    expect(formatLocalDateTime('2026-07-18T20:05:00Z', 'Asia/Shanghai')).toBe('2026-07-19 04:05')
  })

  it('非法字符串返回 null，不抛错', () => {
    expect(formatLocalDateTime('not-a-date', 'UTC')).toBeNull()
  })
})

describe('runTimestamp', () => {
  it('优先 started_at，缺失时回落 finished_at，都没有返回 null', () => {
    expect(runTimestamp({ startedAt: 'a', finishedAt: 'b' })).toBe('a')
    expect(runTimestamp({ startedAt: null, finishedAt: 'b' })).toBe('b')
    expect(runTimestamp({ startedAt: null, finishedAt: null })).toBeNull()
  })
})
