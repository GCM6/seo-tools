// P3 关键词缺口计算（纯函数）——真源：v3 方法论 §4 P3（K03 missing / K04 weak）。
// 输入 = 种子词 SERP 结果型 + 人工确认后的竞品域 + 可选 Labs 关键词数据（搜索量/难度/意图）。
// 无 IO、不碰 DB/provider。缺口只在"竞品占位而本站缺席/弱势"时成立——依赖人在环确认的竞品集。

import type { SeedSerpEntry, LabsKeywordDatum } from '@/lib/dataforseo/types'

// gapType 语义：
//   missing = 本站无排名 且 ≥2 个确认竞品进 Top10（真缺口，最高优先）
//   weak    = 本站 11-30 名 且 ≥1 竞品 Top10（有基础但落后，真缺口）
//   winning = 本站 Top10（非缺口，仅记录用于对比展示）
export type KeywordGapType = 'missing' | 'weak' | 'winning'

export interface KeywordGapResult {
  keyword: string
  gapType: KeywordGapType
  ourPosition: number | null // 本站在该词 SERP 的最优位次；null = 未排名（未进抓取的 Top-N）
  competitorPositions: { domain: string; position: number }[] // 确认竞品中进 Top10 的域及位次
  opportunityScore: number // 0-100，确定性打分，越高越值得优先补
  searchVolume: number | null // 来自 Labs；缺失=null
}

const TOP10 = 10 // Top10 阈值：竞品是否"占位"的判定线
const WEAK_MAX = 30 // 弱势区间上界：本站 11-30 名算 weak（>30 视同基本无效曝光，不计缺口）

// 域名归一：小写 + 去 www.（比较口径全链一致）。
function normDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '')
}

// 求某域在一条 SERP items 中的最优（最小）rank，未出现返回 null。
function bestRank(items: SeedSerpEntry['items'], target: string): number | null {
  let best: number | null = null
  for (const item of items) {
    if (item.rank <= 0) continue
    if (normDomain(item.domain) !== target) continue
    if (best === null || item.rank < best) best = item.rank
  }
  return best
}

// —— opportunityScore 打分（确定性，归一 0-100）——
// 公式：score = volumeFactor × intentFactor × accessibilityFactor × 100
//   · volumeFactor（搜索量因子，0..1）：对数刻度 log10(vol+1)/log10(VOL_CAP+1)。
//       搜索量缺失 → 0（spec 明确"缺失给 0 权重"），乘性传导使无量词自然沉底。
//   · intentFactor（意图权重）：transactional/commercial 商业意图 > informational，
//       未知意图给中性 0.5（不惩罚也不加成）。
//   · accessibilityFactor（难度可及性）：(100-difficulty)/100，难度越低越易拿；
//       难度缺失给中性 0.5。
// 三者均为启发式权重（行业无统一标准，随 RULES_VERSION 固化），乘性组合，最大值 1×1×1×100=100。
const VOL_CAP = 100_000 // 搜索量归一上限：≥10w 视作满分量级

function volumeFactor(searchVolume: number | null): number {
  if (searchVolume === null || searchVolume <= 0) return 0
  const f = Math.log10(searchVolume + 1) / Math.log10(VOL_CAP + 1)
  return Math.min(1, Math.max(0, f))
}

function intentFactor(intent: string | null): number {
  switch ((intent ?? '').toLowerCase()) {
    case 'transactional':
      return 1.0
    case 'commercial':
      return 0.9
    case 'informational':
      return 0.5
    case 'navigational':
      return 0.3
    default:
      return 0.5 // 未知/缺失：中性
  }
}

function accessibilityFactor(difficulty: number | null): number {
  if (difficulty === null) return 0.5 // 缺失：中性
  const d = Math.min(100, Math.max(0, difficulty))
  return (100 - d) / 100
}

function opportunityScore(datum: LabsKeywordDatum | undefined): number {
  const vol = datum?.searchVolume ?? null
  const intent = datum?.intent ?? null
  const difficulty = datum?.difficulty ?? null
  const raw = volumeFactor(vol) * intentFactor(intent) * accessibilityFactor(difficulty) * 100
  return Math.round(raw)
}

/**
 * 计算关键词缺口表。仅对能归入 missing / weak / winning 的词产出结果，
 * 其余（如本站 >30 名、或本站缺席但竞品占位 <2 个）不构成明确机会，剔除。
 * @param input.serp 种子词 SERP
 * @param input.ownDomain 本站域名
 * @param input.confirmedCompetitorDomains 人工确认的竞品域（无确认竞品 → 无缺口结果）
 * @param input.keywordData 可选 Labs 数据（搜索量/难度/意图），用于打分与展示
 */
export function computeKeywordGaps(input: {
  serp: SeedSerpEntry[]
  ownDomain: string
  confirmedCompetitorDomains: string[]
  keywordData?: LabsKeywordDatum[]
}): KeywordGapResult[] {
  const { serp, ownDomain, confirmedCompetitorDomains, keywordData } = input
  const own = normDomain(ownDomain)
  const competitors = [...new Set(confirmedCompetitorDomains.map(normDomain))].filter(
    (d) => d !== own,
  )

  // Labs 数据按归一 keyword 建索引（keyword 小写去空白），便于 O(1) 查表。
  const labsByKeyword = new Map<string, LabsKeywordDatum>()
  for (const d of keywordData ?? []) {
    labsByKeyword.set(d.keyword.trim().toLowerCase(), d)
  }

  const results: KeywordGapResult[] = []

  for (const entry of serp) {
    const ourPosition = bestRank(entry.items, own)

    // 确认竞品中进 Top10 的域及位次。
    const competitorPositions: { domain: string; position: number }[] = []
    for (const comp of competitors) {
      const rank = bestRank(entry.items, comp)
      if (rank !== null && rank <= TOP10) competitorPositions.push({ domain: comp, position: rank })
    }
    // 位次升序，展示稳定。
    competitorPositions.sort((a, b) =>
      a.position - b.position || (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0),
    )
    const compTop10Count = competitorPositions.length

    let gapType: KeywordGapType | null = null
    if (ourPosition !== null && ourPosition <= TOP10) {
      gapType = 'winning'
    } else if (ourPosition === null && compTop10Count >= 2) {
      gapType = 'missing'
    } else if (ourPosition !== null && ourPosition > TOP10 && ourPosition <= WEAK_MAX && compTop10Count >= 1) {
      gapType = 'weak'
    }
    if (gapType === null) continue // 未构成明确机会/对比，剔除

    const datum = labsByKeyword.get(entry.keyword.trim().toLowerCase())
    results.push({
      keyword: entry.keyword,
      gapType,
      ourPosition,
      competitorPositions,
      opportunityScore: opportunityScore(datum),
      searchVolume: datum?.searchVolume ?? null,
    })
  }

  // opportunityScore 降序；同分按 keyword 字典序，保证确定性。
  results.sort((a, b) =>
    b.opportunityScore - a.opportunityScore ||
    (a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0),
  )

  return results
}
