import { describe, it, expect } from 'vitest'
import { ACTIVE_RUN_STATUSES, COMPLETED_RUN_STATUSES, isActiveRunStatus, isCompletedRunStatus } from './status'

describe('run 状态划分', () => {
  it('ACTIVE_RUN_STATUSES 固定为 draft/collecting/collected/diagnosing', () => {
    expect(ACTIVE_RUN_STATUSES).toEqual(['draft', 'collecting', 'collected', 'diagnosing'])
  })

  it('COMPLETED_RUN_STATUSES 固定为 reviewing/output', () => {
    expect(COMPLETED_RUN_STATUSES).toEqual(['reviewing', 'output'])
  })

  it.each(['draft', 'collecting', 'collected', 'diagnosing'])('isActiveRunStatus(%s) 为 true', (s) => {
    expect(isActiveRunStatus(s)).toBe(true)
  })

  it.each(['reviewing', 'output', 'failed'])('isActiveRunStatus(%s) 为 false', (s) => {
    expect(isActiveRunStatus(s)).toBe(false)
  })

  it.each(['reviewing', 'output'])('isCompletedRunStatus(%s) 为 true', (s) => {
    expect(isCompletedRunStatus(s)).toBe(true)
  })

  it.each(['draft', 'collecting', 'collected', 'diagnosing', 'failed'])('isCompletedRunStatus(%s) 为 false', (s) => {
    expect(isCompletedRunStatus(s)).toBe(false)
  })
})
