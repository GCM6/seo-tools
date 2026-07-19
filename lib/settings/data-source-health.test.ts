import { describe, it, expect } from 'vitest'
import {
  GLOBAL_HEALTH_KEYS,
  PROJECT_HEALTH_KEYS,
  summarizeDataSourceHealth,
  summarizeProjectDataSourceHealth,
} from './data-source-health'
import type { DataSourceStatus } from './data-sources'

function statuses(over: Partial<Record<DataSourceStatus['key'], Partial<DataSourceStatus>>> = {}): DataSourceStatus[] {
  const base: DataSourceStatus[] = [
    { key: 'gsc', configured: false, connected: false },
    { key: 'googleCse', configured: false },
    { key: 'aiProbe', configured: false },
    { key: 'dataforseo', configured: false },
    { key: 'render', configured: false },
    { key: 'psi', configured: true },
    { key: 'publicCorpora', configured: true },
  ]
  return base.map((status) => ({ ...status, ...over[status.key] }))
}

describe('数据源健康度作用域', () => {
  it('全局健康度只统计四项共享服务，不因任一项目 GSC 已连接而变化', () => {
    const health = summarizeDataSourceHealth(
      statuses({ gsc: { configured: true, connected: true }, aiProbe: { configured: true } }),
    )

    expect(health.total).toBe(4)
    expect(health.items.map((item) => item.key)).toEqual([...GLOBAL_HEALTH_KEYS])
    expect(health.items.some((item) => item.key === 'gsc')).toBe(false)
    expect(health.up).toBe(1)
  })

  it('项目健康度才将该项目已选定 property 的 GSC 纳入覆盖率', () => {
    const pending = summarizeProjectDataSourceHealth(statuses({ gsc: { configured: true, connected: false } }))
    const connected = summarizeProjectDataSourceHealth(statuses({ gsc: { configured: true, connected: true } }))

    expect(pending.total).toBe(5)
    expect(connected.items.map((item) => item.key)).toEqual([...PROJECT_HEALTH_KEYS])
    expect(pending.up).toBe(0)
    expect(connected.up).toBe(1)
  })
})
