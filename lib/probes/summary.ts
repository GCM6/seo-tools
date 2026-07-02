// 探针结果聚合：AI 可见度（X/20）、答案出现地图、竞品 SoV 的唯一数据来源。
// 纯函数：只消费已落库的 prompts + ai_probe_results，绝不产出无证据支撑的数字。

export interface ProbeSummaryInput {
  prompts: { id: string; text: string; priority: number }[]
  results: {
    promptId: string
    brandPresent: boolean
    competitorsMentioned: string[]
    evidenceId: string
  }[]
  brand: string
  competitors: string[]
}

export interface ProbeSummary {
  promptsTotal: number
  promptsPresent: number
  totalSamples: number
  perPrompt: { text: string; present: boolean }[]
  sov: { name: string; pct: number; you: boolean }[]
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

  return {
    promptsTotal: ordered.length,
    promptsPresent: perPrompt.filter((p) => p.present).length,
    totalSamples: total,
    perPrompt,
    sov,
    sampleEvidenceId: results.find((r) => r.brandPresent)?.evidenceId ?? results[0]?.evidenceId ?? null,
  }
}
