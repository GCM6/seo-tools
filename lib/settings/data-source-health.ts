import type { DataSourceStatus } from './data-sources'

// 数据源健康度汇总（顶栏常驻 pill / 覆盖率横幅）。纯函数：状态矩阵 → up/total。
// 只统计「需要配置且会真出数」的 5 个源；psi/publicCorpora 恒可用、无需连接，不计入
// （计入会让分母永远垫底 2 格，弱化「你还差几个」的紧迫感）。（spec §SP-G2b-1）
export const HEALTH_KEYS = ['gsc', 'googleCse', 'aiProbe', 'dataforseo', 'render'] as const
export type HealthKey = (typeof HEALTH_KEYS)[number]

export interface HealthItem {
  key: HealthKey
  up: boolean
}

export interface DataSourceHealth {
  up: number
  total: number
  items: HealthItem[]
}

export function summarizeDataSourceHealth(statuses: DataSourceStatus[]): DataSourceHealth {
  const byKey = new Map(statuses.map((s) => [s.key, s]))
  const items: HealthItem[] = HEALTH_KEYS.map((key) => {
    const s = byKey.get(key)
    // GSC 授权到本项目（connected）才算真出数；其余源看环境/DB 是否配置。
    const up = key === 'gsc' ? s?.connected === true : s?.configured === true
    return { key, up }
  })
  return { up: items.filter((i) => i.up).length, total: HEALTH_KEYS.length, items }
}
