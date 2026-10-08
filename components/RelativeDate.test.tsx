import { describe, it, expect } from 'vitest'
import { relativeDayLabel } from './RelativeDate'

describe('relativeDayLabel', () => {
  const now = new Date(2026, 9, 8, 15, 0, 0) // 本地时间 2026-10-08 15:00

  it('按天给相对说法，文案来自 Intl（不写死中英文）', () => {
    expect(relativeDayLabel(new Date(2026, 9, 9, 9, 0).toISOString(), 'zh', now)).toBe('明天')
    expect(relativeDayLabel(new Date(2026, 9, 5, 9, 0).toISOString(), 'zh', now)).toBe('3天前')
    expect(relativeDayLabel(new Date(2026, 9, 18, 9, 0).toISOString(), 'en', now)).toBe('in 10 days')
  })

  it('两个月以外直接给日期（返回 null 由调用方显示日期）；非法输入返回 null', () => {
    expect(relativeDayLabel(new Date(2027, 0, 30).toISOString(), 'zh', now)).toBeNull()
    expect(relativeDayLabel('not-a-date', 'zh', now)).toBeNull()
  })
})
