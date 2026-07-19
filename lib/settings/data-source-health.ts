import type { DataSourceStatus } from './data-sources'

// 共享服务只统计全局凭据；GSC 的 OAuth token 与 property 严格属于单个项目，不能混入。
// psi/publicCorpora 恒可用且无需接入，同样不计入任何健康度分母。
export const GLOBAL_HEALTH_KEYS = ['googleCse', 'aiProbe', 'dataforseo', 'render'] as const
export const PROJECT_HEALTH_KEYS = ['gsc', ...GLOBAL_HEALTH_KEYS] as const
export type HealthKey = (typeof PROJECT_HEALTH_KEYS)[number]

export interface HealthItem {
  key: HealthKey
  up: boolean
}

export interface DataSourceHealth {
  up: number
  total: number
  items: HealthItem[]
}

function summarize(statuses: DataSourceStatus[], keys: readonly HealthKey[]): DataSourceHealth {
  const byKey = new Map(statuses.map((s) => [s.key, s]))
  const items: HealthItem[] = keys.map((key) => {
    const s = byKey.get(key)
    const up = key === 'gsc' ? s?.connected === true : s?.configured === true
    return { key, up }
  })
  return { up: items.filter((i) => i.up).length, total: keys.length, items }
}

// 设置页、首页等全局位置只展示共享服务的就绪度。
export const summarizeDataSourceHealth = (statuses: DataSourceStatus[]) =>
  summarize(statuses, GLOBAL_HEALTH_KEYS)

// 当前项目的运行页才将 GSC 纳入数据覆盖率。
export const summarizeProjectDataSourceHealth = (statuses: DataSourceStatus[]) =>
  summarize(statuses, PROJECT_HEALTH_KEYS)
