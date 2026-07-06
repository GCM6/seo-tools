// P4 竞品识别（纯函数，客观算法）——真源：v3 方法论 §4 P4「识别算法」。
// 输入 = DataForSEO 种子词 SERP 结果型（SeedSerpEntry[]），无 IO、不碰 DB/provider。
// 算法：遍历每个种子词 SERP 的 items，对每个域名统计出现词数 / 加权位置分（Σ 1/rank）/
// Search Overlap（出现该域的词数 ÷ 种子词总数）；滤掉本站与平台/基础设施域；按 overlap 降序取 Top-N。
// 分级提醒：竞品候选仅是启发式识别，须经人工确认（人在环）后才参与 gap / SoV 对比。

import type { SeedSerpEntry } from '@/lib/dataforseo/types'

// —— 基础设施 / 平台域白名单：这些域高频出现在几乎所有词的 SERP，
// 属"平台竞争者"而非目标站的商业竞品，识别时单独排除（不进候选）。
// amazon 的区域站（amazon.co.uk / amazon.de …）由 isPlatformDomain 的正则兜底。
export const PLATFORM_DOMAINS: readonly string[] = [
  'wikipedia.org',
  'youtube.com',
  'reddit.com',
  'facebook.com',
  'linkedin.com',
  'quora.com',
  'pinterest.com',
  'medium.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'github.com',
  'stackoverflow.com',
  'amazon.com',
  'google.com',
  'bing.com',
  'apple.com',
  'microsoft.com',
  'yelp.com',
  'tripadvisor.com',
]

// 竞品候选（供编排层 upsert competitors 表 + UI 决策依据卡展示）。
export interface CompetitorCandidate {
  domain: string
  overlapScore: number // Search Overlap = 出现该域的种子词数 / 种子词总数，0..1
  sharedKeywordsCount: number // 该域在多少个种子词的 SERP 中出现（去重计一次/词）
  weightedPositionScore: number // Σ 1/rank，跨全部出现位置累加，越高=排得越靠前/越频繁
  topSharedKeywords: string[] // 该域出现的前 ≤5 个种子词，供 UI 决策依据卡
}

const PLATFORM_SET = new Set(PLATFORM_DOMAINS)

// 域名归一：去协议无关，只统一小写并剥掉 www. 前缀（比较口径全链一致）。
function normDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '')
}

// 是否平台/基础设施域：白名单命中，或 amazon 的任意区域站。
function isPlatformDomain(domain: string): boolean {
  if (PLATFORM_SET.has(domain)) return true
  // amazon.com（已在白名单）+ amazon.co.uk / amazon.de / amazon.co.jp 等区域站。
  return /^amazon\.[a-z.]+$/.test(domain)
}

interface DomainAgg {
  domain: string
  keywordSet: Set<string> // 出现过的去重种子词（用于 overlap / sharedKeywordsCount）
  orderedKeywords: string[] // 首次出现顺序（用于 topSharedKeywords，与种子词序一致）
  weightedPositionScore: number
}

/**
 * 从种子词 SERP 识别 organic 竞品候选。
 * @param input.serp 每个种子词的 Google Top-N SERP（rank 为 rankAbsolute，1..N）
 * @param input.ownDomain 本站域名（识别时排除自身）
 * @param input.topN 取前 N 个候选（默认由调用方传，spec 建议 10）
 */
export function identifyCompetitors(input: {
  serp: SeedSerpEntry[]
  ownDomain: string
  topN: number
}): CompetitorCandidate[] {
  const { serp, ownDomain, topN } = input
  if (topN <= 0 || serp.length === 0) return []

  const own = normDomain(ownDomain)
  const totalSeeds = serp.length // Search Overlap 的分母 = 种子词总数
  const byDomain = new Map<string, DomainAgg>()

  for (const entry of serp) {
    // 同一词的 SERP 内，一个域可能多次出现；overlap/词数按"每词计一次"，
    // 加权位置分则对每次出现都累加 1/rank。
    const seenThisKeyword = new Set<string>()
    for (const item of entry.items) {
      const domain = normDomain(item.domain)
      if (domain === own || isPlatformDomain(domain)) continue
      if (item.rank <= 0) continue // 非法 rank 防御，避免除零/负分

      let agg = byDomain.get(domain)
      if (!agg) {
        agg = { domain, keywordSet: new Set(), orderedKeywords: [], weightedPositionScore: 0 }
        byDomain.set(domain, agg)
      }
      agg.weightedPositionScore += 1 / item.rank
      if (!seenThisKeyword.has(domain)) {
        seenThisKeyword.add(domain)
        if (!agg.keywordSet.has(entry.keyword)) {
          agg.keywordSet.add(entry.keyword)
          agg.orderedKeywords.push(entry.keyword)
        }
      }
    }
  }

  const candidates: CompetitorCandidate[] = []
  for (const agg of byDomain.values()) {
    const sharedKeywordsCount = agg.keywordSet.size
    candidates.push({
      domain: agg.domain,
      overlapScore: sharedKeywordsCount / totalSeeds,
      sharedKeywordsCount,
      weightedPositionScore: agg.weightedPositionScore,
      topSharedKeywords: agg.orderedKeywords.slice(0, 5),
    })
  }

  // 主排序 overlapScore 降序；同分用加权位置分降序、再域名字典序，保证确定性。
  candidates.sort((a, b) => {
    if (b.overlapScore !== a.overlapScore) return b.overlapScore - a.overlapScore
    if (b.weightedPositionScore !== a.weightedPositionScore) {
      return b.weightedPositionScore - a.weightedPositionScore
    }
    return a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0
  })

  return candidates.slice(0, topN)
}
