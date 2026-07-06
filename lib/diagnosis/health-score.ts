import type { Pillar } from './types'
import type { FindingSeverity } from './types'

// 健康分（spec §7.1）——沟通用汇总分，恒标「推断/inferred」，不是实测。
// 公式（逐字实现，见 spec §7.1）：
//   pillar_score = 100 × (1 − Σ(issue_weight × affected_ratio) / max_penalty)
//     issue_weight: error=3 / warning=1 / notice=0.25
//     （finding 严重度映射：high=error=3、mid=warning=1、ok=notice=0.25）
//     affected_ratio: 受影响页数/已检页数（站级问题计 1）
//   overall = 加权平均（P1 30% / P2 20% / P3 20% / P4 10% / P5 20%）
// 数据源缺失的支柱显示「未评分」(null) 而非 0，并从 overall 中剔除、剩余支柱按权重重归一。

// finding 严重度 → issue_weight（spec §7.1）
const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  high: 3, // error
  mid: 1, // warning
  ok: 0.25, // notice
}

// 五支柱权重（spec §7.1，和恒为 1）。
export const PILLAR_WEIGHTS: Record<Pillar, number> = {
  P1: 0.3,
  P2: 0.2,
  P3: 0.2,
  P4: 0.1,
  P5: 0.2,
}

const PILLARS: Pillar[] = ['P1', 'P2', 'P3', 'P4', 'P5']

// 默认 max_penalty（惩罚预算）。error=3，取 12 ≈ 4 条站级 error 级 finding（或等权组合）
// 即可把某支柱压到 0——渐进降级而非「一条就清零」的悬崖。可由入参覆盖。
export const DEFAULT_MAX_PENALTY = 12

export interface HealthScoreInput {
  // affectedRatio 默认 1（站级问题）。
  findings: { pillar: Pillar; severity: FindingSeverity; affectedRatio?: number }[]
  // 实际采集到数据源的支柱；不在其中的支柱渲染「未评分」(null)，不计 0。
  pillarsWithData: Pillar[]
  // 惩罚除数上限；缺省用 DEFAULT_MAX_PENALTY。
  maxPenalty?: number
}

export interface HealthScoreResult {
  // null = 未评分（该支柱不在 pillarsWithData）。
  pillars: Record<Pillar, { score: number | null; issueCount: number }>
  // 仅对已评分支柱做加权平均并重归一；无任一支柱有数据时为 null。
  overall: number | null
  weights: Record<Pillar, number>
  // 报告页可展开的「分数怎么算的」白话解释（中文）。
  breakdown: string
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

const round1 = (n: number): number => Math.round(n * 10) / 10

export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  const maxPenalty = input.maxPenalty ?? DEFAULT_MAX_PENALTY
  const scored = new Set<Pillar>(input.pillarsWithData)

  // 逐支柱累计惩罚与 finding 计数。
  const penalty: Record<Pillar, number> = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 }
  const issueCount: Record<Pillar, number> = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 }
  for (const f of input.findings) {
    const ratio = clamp(f.affectedRatio ?? 1, 0, 1)
    penalty[f.pillar] += SEVERITY_WEIGHT[f.severity] * ratio
    issueCount[f.pillar] += 1
  }

  const pillars = {} as HealthScoreResult['pillars']
  for (const p of PILLARS) {
    if (!scored.has(p)) {
      pillars[p] = { score: null, issueCount: issueCount[p] }
      continue
    }
    const raw = 100 * (1 - penalty[p] / maxPenalty)
    pillars[p] = { score: round1(clamp(raw, 0, 100)), issueCount: issueCount[p] }
  }

  // overall：仅已评分支柱加权平均，权重按剩余支柱重归一。
  let weightSum = 0
  let weighted = 0
  for (const p of PILLARS) {
    const s = pillars[p].score
    if (s === null) continue
    weightSum += PILLAR_WEIGHTS[p]
    weighted += PILLAR_WEIGHTS[p] * s
  }
  const overall = weightSum > 0 ? round1(weighted / weightSum) : null

  return {
    pillars,
    overall,
    weights: { ...PILLAR_WEIGHTS },
    breakdown: buildBreakdown(input, pillars, penalty, maxPenalty, overall),
  }
}

function buildBreakdown(
  input: HealthScoreInput,
  pillars: HealthScoreResult['pillars'],
  penalty: Record<Pillar, number>,
  maxPenalty: number,
  overall: number | null,
): string {
  const lines: string[] = []
  lines.push('健康分说明（标签恒为「推断/inferred」——这是沟通用汇总分，不是实测）：')
  lines.push('')
  lines.push('单支柱公式：pillar = 100 × (1 − Σ(问题权重 × 受影响比例) / max_penalty)')
  lines.push(
    `问题权重：error(high)=3、warning(mid)=1、notice(ok)=0.25；受影响比例=受影响页数/已检页数（站级问题计 1）；max_penalty=${maxPenalty}（惩罚预算，超出即封顶 0）。`,
  )
  lines.push('分数裁剪到 [0, 100]。数据源缺失的支柱显示「未评分」而非 0 分，且不参与总分。')
  lines.push('')
  for (const p of PILLARS) {
    const cell = pillars[p]
    if (cell.score === null) {
      lines.push(`${p}：未评分（未采集到对应数据源）。`)
      continue
    }
    lines.push(
      `${p}：命中 ${cell.issueCount} 条，惩罚合计 ${round1(penalty[p])} / ${maxPenalty} → 得分 ${cell.score}（权重 ${PILLAR_WEIGHTS[p]}）。`,
    )
  }
  lines.push('')
  lines.push(
    'overall = 已评分支柱的加权平均（P1 30% / P2 20% / P3 20% / P4 10% / P5 20%）；有支柱未评分时，其权重从分母剔除，其余支柱按比例重归一。',
  )
  lines.push(overall === null ? 'overall：无任一支柱有数据，未评分。' : `overall = ${overall}。`)
  return lines.join('\n')
}
