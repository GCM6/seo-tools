// DataForSEO v3 SERP 端点封装：
// - seedSerp：Google organic Top-N，种子词逐词请求（live 接口一次只收 1 个任务），有界并发；
// - bingIndex：Bing `site:` 收录量（G04，影响 ChatGPT 可发现性）；
// - brandSerp：品牌词 Google SERP，检测 knowledge_graph（E02）+ 官网占位。

import type { DataforseoClient } from './client'
import { DataforseoTaskError, asNumber, asRecord, asString, firstResultOrThrow, itemsOf, itemsOrThrow, normalizeDomain } from './client'
import type { BingIndexResult, BrandSerpResult, SeedSerpEntry, SeedSerpResult, SerpItem } from './types'
import { organicPosition } from './serp-position'

// live 端点一次请求只收 1 个 task：多 task 时每个 task 都回 40000「You can set only one task at a time」
// （2026-10-03 端到端实测；原先按「上限约 100」批量发送，SERP 采集从未成功过）。逐词请求、有界并发。
const SERP_CONCURRENCY = 5
// 40102「No Search Results」：查询有效但零结果，是测量结果（空 SERP）而非故障。
export const NO_SEARCH_RESULTS = 40102

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
    rankGroup: asNumber(item.rank_group),
    title: asString(item.title) ?? '',
    type: asString(item.type) ?? 'organic',
  }
}

// 单任务请求；40102（零结果）返回 null 由调用方记为空结果，其余错误照常抛出。
async function postAllowingNoResults(client: DataforseoClient, path: string, body: unknown) {
  try {
    return await client.post(path, body)
  } catch (err) {
    if (err instanceof DataforseoTaskError && err.statusCode === NO_SEARCH_RESULTS) return null
    throw err
  }
}

// Google Top-N SERP：种子词逐词请求 → 每词 items 的 domain/url/rank/title/type（按种子词顺序）。
// 单词的任务级错误只记入 failedKeywords；HTTP/信封级错误（鉴权、额度）立即停止发新请求并抛出。
export async function seedSerp(
  client: DataforseoClient,
  keywords: string[],
  opts: { locationCode: number; languageCode: string; depth?: number },
): Promise<SeedSerpResult> {
  // depth 默认 10（Top-10）；显式传入则透传。
  const depth = opts.depth ?? 10
  const slots: (SeedSerpEntry | null)[] = keywords.map(() => null)
  const failed: { index: number; keyword: string; error: string; statusCode?: number }[] = []
  let fatal: unknown = null
  let next = 0

  const worker = async () => {
    while (fatal === null && next < keywords.length) {
      const index = next++
      const keyword = keywords[index]
      try {
        const tasks = await client.post('/v3/serp/google/organic/live/advanced', [serpTaskBody(keyword, { ...opts, depth })])
        const result = asRecord(tasks[0]?.result[0])
        // 任务成功却没有 result：记为该词失败（empty_result），不再静默丢掉（第二波审查 C1）。
        if (!result) {
          failed.push({ index, keyword, error: 'empty_result' })
          continue
        }
        const rawItems = itemsOf(result)
        // 缺 items 的成功响应：记为该词失败（invalid_shape），不当成"该词 0 条结果"（最终审查 F1-1）。
        if (rawItems === null) {
          failed.push({ index, keyword, error: 'invalid_shape' })
          continue
        }
        const items = rawItems
          .map(toSerpItem)
          .filter((x): x is SerpItem => x !== null)
        slots[index] = { keyword: asString(result.keyword) ?? keyword, items }
      } catch (err) {
        if (err instanceof DataforseoTaskError && err.statusCode === NO_SEARCH_RESULTS) slots[index] = { keyword, items: [] }
        else if (err instanceof DataforseoTaskError) failed.push({ index, keyword, error: err.message, statusCode: err.statusCode })
        else fatal = err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(SERP_CONCURRENCY, keywords.length) }, worker))
  if (fatal !== null) throw fatal
  const results = slots.filter((x): x is SeedSerpEntry => x !== null)
  const failedKeywords = failed.sort((a, b) => a.index - b.index).map(({ keyword, error, statusCode }) => ({ keyword, error, ...(statusCode !== undefined ? { statusCode } : {}) }))

  return {
    engine: 'google',
    locationCode: opts.locationCode,
    languageCode: opts.languageCode,
    results,
    ...(failedKeywords.length ? { failedKeywords } : {}),
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
  const tasks = await postAllowingNoResults(client, '/v3/serp/bing/organic/live/advanced', body)
  // 40102（零结果）= site: 查询收录 0：G04 要测的正是这个，不能当异常丢掉。
  if (tasks === null) return { engine: 'bing', domain: normalized, totalCount: 0, itemCount: 0 }
  const result = firstResultOrThrow(tasks)
  const items = itemsOrThrow(result)

  return {
    engine: 'bing',
    domain: normalized,
    totalCount: asNumber(result.se_results_count),
    itemCount: items.length,
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
  const tasks = await postAllowingNoResults(client, '/v3/serp/google/organic/live/advanced', body)
  // 40102（零结果）是测量值：品牌词没有任何结果；任务成功却没有 result 才是失败。
  const rawItems = tasks === null ? [] : itemsOrThrow(firstResultOrThrow(tasks))

  let hasKnowledgePanel = false
  const items: BrandSerpResult['items'] = []

  for (const raw of rawItems) {
    const item = asRecord(raw)
    if (!item) continue
    // knowledge_graph 无需 domain/url 即算命中知识面板（E02）。
    if (asString(item.type) === 'knowledge_graph') hasKnowledgePanel = true
    const d = asString(item.domain)
    const url = asString(item.url)
    const rank = asNumber(item.rank_absolute)
    if (d && url && rank !== null) {
      items.push({ domain: normalizeDomain(d), url, rank, rankGroup: asNumber(item.rank_group), type: asString(item.type) ?? 'organic' })
    }
  }

  return {
    engine: 'google',
    brandQuery,
    hasKnowledgePanel,
    // 只看自然结果（含精选摘要）：官网只以广告出现不算"在品牌词首页"（验收新发现 3）。
    ownDomainPresent: items.some((it) => it.domain === ownDomain && organicPosition(it) !== null),
    items,
  }
}
