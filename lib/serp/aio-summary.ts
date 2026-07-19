// AIO 曝光聚合：把 serp_aio_results 行汇总成 UI 消费的 AioExposureSummary。
// 字段契约由主循环裁决并冻结（UI 任务并行消费同一契约，字段名不得改，可加不可删）。
//
// 引用来源归属分类复用 lib/probes/citation-origin.ts 的 classifyCitationOrigin（不重写域名逻辑，
// 任务书显式要求）——owned/third_party 二分类，未知来源保守归 third_party。
import { classifyCitationOrigin } from '@/lib/probes/citation-origin'

export type AioExposureSummary = {
  totalQueries: number
  measuredQueries: number // 实际拿到 SERP 响应的查询数
  aioPresentCount: number // 出现 AI Overview 的查询数
  ownedCitedCount: number // AIO references 命中自有域名的查询数
  citedDomains: { domain: string; count: number; origin: 'owned' | 'third_party' }[]
  perQuery: { query: string; aioPresent: boolean; ownedCited: boolean; citedUrls: string[] }[]
}

export interface AioResultRow {
  keyword: string
  aioPresent: boolean
  targetDomainCited: boolean
  citedUrls: string[]
}

export interface AggregateAioExposureInput {
  // 本次 run 尝试过的 AIO 查询总数（成功 + 失败，即已落 serp_aio 证据的条数）。
  // 与探针阶段 attemptedCount 同一语义——市场未映射直接跳过时应传 0。
  totalQueries: number
  // 成功拿到 SERP 响应并落 serp_aio_results 的行（measuredQueries = results.length）。
  results: AioResultRow[]
  domain: string
}

export function aggregateAioExposure(input: AggregateAioExposureInput): AioExposureSummary {
  const { totalQueries, results, domain } = input
  const measuredQueries = results.length
  const aioPresentCount = results.filter((r) => r.aioPresent).length
  const ownedCitedCount = results.filter((r) => r.targetDomainCited).length

  const domainCounts = new Map<string, { count: number; origin: 'owned' | 'third_party' }>()
  for (const r of results) {
    for (const url of r.citedUrls) {
      let host: string
      try {
        host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
      } catch {
        continue
      }
      const origin = classifyCitationOrigin(url, domain)
      const prev = domainCounts.get(host)
      domainCounts.set(host, { count: (prev?.count ?? 0) + 1, origin })
    }
  }
  const citedDomains = [...domainCounts.entries()]
    .map(([d, v]) => ({ domain: d, count: v.count, origin: v.origin }))
    .sort((a, b) => b.count - a.count)

  const perQuery = results.map((r) => ({
    query: r.keyword,
    aioPresent: r.aioPresent,
    ownedCited: r.targetDomainCited,
    citedUrls: r.citedUrls,
  }))

  return { totalQueries, measuredQueries, aioPresentCount, ownedCitedCount, citedDomains, perQuery }
}
