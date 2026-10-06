import type { DataSourceStatus } from '@/db/schema'

// 子阶段状态（SP-A §4.2）：source_key 用「父:子」（冒号——next-intl 会把点号当成嵌套路径）。
export const subSourceKey = (parent: string, child: string): string => `${parent}:${child}`
export const parentOf = (key: string): string => key.split(':')[0]

// 父级状态由子阶段汇总：全 collected → collected；有成功也有失败/未尝试 → partial；
// 全未尝试 → not_attempted；其余（无任何成功）→ failed。
export function aggregateParentStatus(children: DataSourceStatus[]): DataSourceStatus {
  if (children.length === 0) return 'not_attempted'
  const collected = children.filter((s) => s === 'collected').length
  if (collected === children.length) return 'collected'
  if (collected > 0 || children.includes('partial')) return 'partial'
  if (children.every((s) => s === 'not_attempted')) return 'not_attempted'
  return 'failed'
}

// 子阶段清单（SP-A §4.2 真源）：报告文案 report.contract.subSourceLabel.<父>_<子> 按此覆盖；
// 测试断言它与三个采集器实际使用的子阶段一致（DFS_SUB_STAGES / SOCIAL_PLATFORMS / 第三方两路）。
export const SUB_SOURCES: Record<'dataforseo' | 'third_party' | 'social_presence', readonly string[]> = {
  dataforseo: ['seed_serp', 'labs', 'backlinks', 'bing_index', 'brand_serp'],
  third_party: ['wikipedia', 'reddit'],
  social_presence: ['youtube', 'g2', 'trustpilot', 'capterra'],
}
