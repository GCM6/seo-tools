import { describe, it, expect } from 'vitest'
import { summarizeDataSourceHealth, HEALTH_KEYS } from './data-source-health'
import type { DataSourceStatus } from './data-sources'

// 构造七源状态：默认全部未就绪，按需覆盖。
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
  return base.map((s) => ({ ...s, ...over[s.key] }))
}

describe('summarizeDataSourceHealth', () => {
  it('只统计 5 个可连接源，排除恒真的 psi/publicCorpora', () => {
    const h = summarizeDataSourceHealth(statuses())
    expect(h.total).toBe(5)
    expect(h.items.map((i) => i.key)).toEqual([...HEALTH_KEYS])
    expect(h.items.some((i) => i.key === ('psi' as never))).toBe(false)
    expect(h.items.some((i) => i.key === ('publicCorpora' as never))).toBe(false)
  })

  it('全未配置时 up=0', () => {
    const h = summarizeDataSourceHealth(statuses())
    expect(h.up).toBe(0)
    expect(h.items.every((i) => i.up === false)).toBe(true)
  })

  it('GSC 需 connected 才算 up——仅 configured 不够', () => {
    const onlyConfigured = summarizeDataSourceHealth(statuses({ gsc: { configured: true, connected: false } }))
    expect(onlyConfigured.items.find((i) => i.key === 'gsc')!.up).toBe(false)
    expect(onlyConfigured.up).toBe(0)

    const connected = summarizeDataSourceHealth(statuses({ gsc: { configured: true, connected: true } }))
    expect(connected.items.find((i) => i.key === 'gsc')!.up).toBe(true)
    expect(connected.up).toBe(1)
  })

  it('其余源看 configured', () => {
    const h = summarizeDataSourceHealth(
      statuses({ googleCse: { configured: true }, aiProbe: { configured: true } }),
    )
    expect(h.up).toBe(2)
    expect(h.items.find((i) => i.key === 'googleCse')!.up).toBe(true)
    expect(h.items.find((i) => i.key === 'render')!.up).toBe(false)
  })

  it('半配场景 3/5', () => {
    const h = summarizeDataSourceHealth(
      statuses({
        gsc: { configured: true, connected: true },
        aiProbe: { configured: true },
        render: { configured: true },
      }),
    )
    expect(h.up).toBe(3)
    expect(h.total).toBe(5)
  })
})
