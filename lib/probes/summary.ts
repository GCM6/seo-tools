// 探针结果聚合：AI 可见度（X/20）、答案出现地图、竞品 SoV 的唯一数据来源。
// 纯函数：只消费已落库的 prompts + ai_probe_results，绝不产出无证据支撑的数字。

export interface ProbeSummaryInput {
  prompts: { id: string; text: string; priority: number }[]
  results: {
    promptId: string
    brandPresent: boolean
    competitorsMentioned: string[]
    evidenceId: string
    // Phase D：分引擎报告与情感聚合所需（旧调用方可不传，聚合优雅降级）。
    provider?: string
    sentiment?: string
  }[]
  brand: string
  competitors: string[]
}

// 引用情感分布（G09）：对含品牌样本按 sentiment 计数。分类器是测量层解析器（parser_version 版本化）。
export interface SentimentBreakdown {
  positive: number
  neutral: number
  negative: number
  comparison: number
  total: number
}

export interface ProbeSummary {
  promptsTotal: number
  promptsPresent: number
  totalSamples: number
  perPrompt: { text: string; present: boolean }[]
  sov: { name: string; pct: number; you: boolean }[]
  // 分引擎可见度（G05/G06 分引擎报告，spec §7.3）：引擎间引用重叠仅 ~11-13.7%，不可互推，故不合并。
  perEngine: { engine: string; promptsPresent: number; promptsTotal: number; samples: number }[]
  // 引用情感分布（G09）：仅统计含品牌样本；n=5 下方向性。
  sentiment: SentimentBreakdown
  // 代表性证据：优先第一条品牌命中的样本，点开可复核原文
  sampleEvidenceId: string | null
}

export function aggregateProbeSummary(input: ProbeSummaryInput): ProbeSummary | null {
  const { prompts, results, brand, competitors } = input
  if (results.length === 0) return null

  const ordered = [...prompts].sort((a, b) => a.priority - b.priority)
  const presentPromptIds = new Set(results.filter((r) => r.brandPresent).map((r) => r.promptId))
  const perPrompt = ordered.map((p) => ({ text: p.text, present: presentPromptIds.has(p.id) }))

  const total = results.length
  const pctOf = (count: number) => Math.round((count / total) * 100)
  const sov = [
    { name: brand, pct: pctOf(results.filter((r) => r.brandPresent).length), you: true },
    ...competitors.map((c) => ({
      name: c,
      pct: pctOf(results.filter((r) => r.competitorsMentioned.includes(c)).length),
      you: false,
    })),
  ].sort((a, b) => b.pct - a.pct)

  // —— 分引擎聚合（G05/G06 分引擎报告）——：按 provider 分组，各自算 prompt 级出现率。
  const byEngine = new Map<string, { present: Set<string>; total: Set<string>; samples: number }>()
  for (const r of results) {
    const engine = r.provider ?? 'unknown'
    const bucket = byEngine.get(engine) ?? { present: new Set<string>(), total: new Set<string>(), samples: 0 }
    bucket.total.add(r.promptId)
    if (r.brandPresent) bucket.present.add(r.promptId)
    bucket.samples += 1
    byEngine.set(engine, bucket)
  }
  const perEngine = [...byEngine.entries()]
    .map(([engine, b]) => ({ engine, promptsPresent: b.present.size, promptsTotal: b.total.size, samples: b.samples }))
    .sort((a, b) => b.promptsPresent - a.promptsPresent || a.engine.localeCompare(b.engine))

  // —— 情感分布（G09）——：仅对含品牌样本计数；未知/缺失归 neutral。
  const brandSamples = results.filter((r) => r.brandPresent)
  const sentiment: SentimentBreakdown = { positive: 0, neutral: 0, negative: 0, comparison: 0, total: brandSamples.length }
  for (const r of brandSamples) {
    const s = r.sentiment
    if (s === 'positive') sentiment.positive += 1
    else if (s === 'negative') sentiment.negative += 1
    else if (s === 'comparison') sentiment.comparison += 1
    else sentiment.neutral += 1
  }

  return {
    promptsTotal: ordered.length,
    promptsPresent: perPrompt.filter((p) => p.present).length,
    totalSamples: total,
    perPrompt,
    sov,
    perEngine,
    sentiment,
    sampleEvidenceId: results.find((r) => r.brandPresent)?.evidenceId ?? results[0]?.evidenceId ?? null,
  }
}
