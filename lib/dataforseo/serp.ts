// DataForSEO v3 SERP 端点封装：
// - seedSerp：Google organic Top-N，批量种子词（内部分批）；
// - bingIndex：Bing `site:` 收录量（G04，影响 ChatGPT 可发现性）；
// - brandSerp：品牌词 Google SERP，检测 knowledge_graph（E02）+ 官网占位。

import type { DataforseoClient } from './client'
import { asArray, asNumber, asRecord, asString, normalizeDomain } from './client'
import type { BingIndexResult, BrandSerpResult, SeedSerpEntry, SeedSerpResult, SerpItem } from './types'

// 单请求最多携带的 task 数（DataForSEO live 上限约 100）；多词分批避免超限。
const SERP_TASK_BATCH = 100

// organic advanced 端点：请求体是数组，每元素一个种子词。
function serpTaskBody(keyword: string, opts: { locationCode: number; languageCode: string; depth?: number }) {
  const body: Record<string, unknown> = {
    keyword,
    location_code: opts.locationCode,
    language_code: opts.languageCode,
  }
  if (opts.depth !== undefined) body.depth = opts.depth
  return body
}

// 从单个 SERP item 提取 SerpItem；缺 domain/url/rank 的（如纯 knowledge_graph）跳过。
function toSerpItem(raw: unknown): SerpItem | null {
  const item = asRecord(raw)
  if (!item) return null
  const domain = asString(item.domain)
  const url = asString(item.url)
  const rank = asNumber(item.rank_absolute)
  if (!domain || !url || rank === null) return null
  return {
    domain: normalizeDomain(domain),
    url,
    rank,
    title: asString(item.title) ?? '',
    type: asString(item.type) ?? 'organic',
  }
}

// Google Top-N SERP：批量种子词 → 每词 items 的 domain/url/rank/title/type。
export async function seedSerp(
  client: DataforseoClient,
  keywords: string[],
  opts: { locationCode: number; languageCode: string; depth?: number },
): Promise<SeedSerpResult> {
  // depth 默认 10（Top-10）；显式传入则透传。
  const depth = opts.depth ?? 10
  const results: SeedSerpEntry[] = []

  for (let i = 0; i < keywords.length; i += SERP_TASK_BATCH) {
    const batch = keywords.slice(i, i + SERP_TASK_BATCH)
    const body = batch.map((keyword) => serpTaskBody(keyword, { ...opts, depth }))
    const tasks = await client.post('/v3/serp/google/organic/live/advanced', body)

    for (const task of tasks) {
      const result = asRecord(task.result[0])
      if (!result) continue
      const items = asArray(result.items)
        .map(toSerpItem)
        .filter((x): x is SerpItem => x !== null)
      results.push({ keyword: asString(result.keyword) ?? '', items })
    }
  }

  return {
    engine: 'google',
    locationCode: opts.locationCode,
    languageCode: opts.languageCode,
    results,
  }
}

// Bing `site:<domain>` 收录检查：totalCount 取 se_results_count，itemCount 取 items 数。
export async function bingIndex(
  client: DataforseoClient,
  domain: string,
  opts: { locationCode: number; languageCode: string },
): Promise<BingIndexResult> {
  const normalized = normalizeDomain(domain)
  const body = [
    {
      keyword: `site:${normalized}`,
      location_code: opts.locationCode,
      language_code: opts.languageCode,
    },
  ]
  const tasks = await client.post('/v3/serp/bing/organic/live/advanced', body)
  const result = asRecord(tasks[0]?.result[0])

  return {
    engine: 'bing',
    domain: normalized,
    totalCount: result ? asNumber(result.se_results_count) : null,
    itemCount: result ? asArray(result.items).length : 0,
  }
}

// 品牌词 Google SERP：检测 knowledge_graph 存在性 + 官网是否出现在结果中。
export async function brandSerp(
  client: DataforseoClient,
  brandQuery: string,
  domain: string,
  opts: { locationCode: number; languageCode: string },
): Promise<BrandSerpResult> {
  const ownDomain = normalizeDomain(domain)
  const body = [
    {
      keyword: brandQuery,
      location_code: opts.locationCode,
      language_code: opts.languageCode,
    },
  ]
  const tasks = await client.post('/v3/serp/google/organic/live/advanced', body)
  const result = asRecord(tasks[0]?.result[0])
  const rawItems = result ? asArray(result.items) : []

  let hasKnowledgePanel = false
  const items: { domain: string; url: string; rank: number }[] = []

  for (const raw of rawItems) {
    const item = asRecord(raw)
    if (!item) continue
    // knowledge_graph 无需 domain/url 即算命中知识面板（E02）。
    if (asString(item.type) === 'knowledge_graph') hasKnowledgePanel = true
    const d = asString(item.domain)
    const url = asString(item.url)
    const rank = asNumber(item.rank_absolute)
    if (d && url && rank !== null) {
      items.push({ domain: normalizeDomain(d), url, rank })
    }
  }

  return {
    engine: 'google',
    brandQuery,
    hasKnowledgePanel,
    ownDomainPresent: items.some((it) => it.domain === ownDomain),
    items,
  }
}
