import { describe, it, expect } from 'vitest'
import { pickLatestRun, type RunLike } from './summary'

const r = (id: string, startedAt: string | null): RunLike => ({
  id,
  runType: 'baseline',
  status: 'output',
  startedAt,
  finishedAt: null,
})

describe('pickLatestRun', () => {
  it('空数组返回 null', () => {
    expect(pickLatestRun([])).toBeNull()
  })

  it('挑 startedAt 最大的 run', () => {
    const picked = pickLatestRun([
      r('a', '2026-07-01T00:00:00Z'),
      r('c', '2026-07-05T00:00:00Z'),
      r('b', '2026-07-03T00:00:00Z'),
    ])
    expect(picked?.id).toBe('c')
  })

  it('startedAt 为 null 的排在有值之后', () => {
    const picked = pickLatestRun([r('draft', null), r('started', '2026-07-01T00:00:00Z')])
    expect(picked?.id).toBe('started')
  })

  it('单个 run 直接返回', () => {
    expect(pickLatestRun([r('only', null)])?.id).toBe('only')
  })
})
