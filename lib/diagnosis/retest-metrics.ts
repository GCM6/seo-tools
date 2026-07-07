import type { ValidationSpec } from './validation-spec'
import type { MetricPair, RetestSnapshotRow } from './retest-delta'
import type { ProbeSummary } from '@/lib/probes/summary'

// 回测标量聚合目标（spec §5.1）：GSC 类 finding 存其关键词集，retest 据此精确取 impressions。
export interface MetricTarget {
  keywords: string[]
}

// 一轮 run 的可比标量来源（回测执行器为 baseline/retest 各构建一份）。
export interface RunMetrics {
  probe: ProbeSummary | null
  gscKeywords: { keyText: string; impressions: number; position: number }[]
}

// 关键词归一：trim + 小写。
const normKw = (s: string): string => s.trim().toLowerCase()

// 从 hit.detail 抽 GSC 聚合关键词集：detail.keywords[].text 或 detail.queries[].query。
// 抽不到（无 detail / 非关键词类 / 空集）→ null。
export function extractMetricTarget(detail?: Record<string, unknown>): MetricTarget | null {
  if (!detail) return null
  const pick = (arr: unknown, field: string): string[] =>
    Array.isArray(arr)
      ? (arr as unknown[])
          .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[field] : undefined))
          .filter((v): v is string => typeof v === 'string')
      : []
  const keywords = [...pick(detail.keywords, 'text'), ...pick(detail.queries, 'query')]
  return keywords.length > 0 ? { keywords } : null
}

// 按 validation_spec（GSC 另需 finding 目标）从一轮取标量；取不到 → null。
export function extractRunMetric(spec: ValidationSpec, run: RunMetrics, target: MetricTarget | null): number | null {
  if (spec.metricSource === 'probe') {
    if (!run.probe) return null
    if (spec.metric === 'brand_sov') {
      const you = run.probe.sov.find((s) => s.you)
      return you ? you.pct : null
    }
    if (spec.metric === 'brand_presence') {
      return run.probe.promptsTotal > 0 ? run.probe.promptsPresent / run.probe.promptsTotal : null
    }
    return null
  }
  if (spec.metricSource === 'gsc' && (spec.metric === 'impressions' || spec.metric === 'position')) {
    if (!target || target.keywords.length === 0) return null
    const wanted = new Set(target.keywords.map(normKw))
    const matched = run.gscKeywords.filter((k) => wanted.has(normKw(k.keyText)))
    if (matched.length === 0) return null
    // impressions 求和；position 取平均（位次类 K02/K06，direction=decrease，均值即方向性够用）。
    return spec.metric === 'position'
      ? matched.reduce((sum, k) => sum + k.position, 0) / matched.length
      : matched.reduce((sum, k) => sum + k.impressions, 0)
  }
  return null
}

// 两轮 → MetricPair；两侧都取到才可比，任一 null → null（回退四态）。
export function buildMetricPair(
  spec: ValidationSpec,
  target: MetricTarget | null,
  baseline: RunMetrics,
  retest: RunMetrics,
): MetricPair | null {
  const b = extractRunMetric(spec, baseline, target)
  const r = extractRunMetric(spec, retest, target)
  if (b === null || r === null) return null
  return { baseline: b, retest: r }
}

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

// probe 品牌指标两轮对比 → 快照行（报告 §8 展示）。任一 null → 空。
export function buildProbeMetricRows(baseline: ProbeSummary | null, retest: ProbeSummary | null): RetestSnapshotRow[] {
  if (!baseline || !retest) return []
  const rows: RetestSnapshotRow[] = []

  const bSov = baseline.sov.find((s) => s.you)?.pct ?? null
  const rSov = retest.sov.find((s) => s.you)?.pct ?? null
  if (bSov !== null && rSov !== null) {
    const d = Math.round((rSov - bSov) * 10) / 10
    rows.push({
      metricName: 'probe.brand_sov',
      baselineValue: `${bSov}%`,
      retestValue: `${rSov}%`,
      delta: signed(d),
      interpretation: d > 0 ? '品牌 AI 答案占有率上升（推断，n=5 方向性）' : d < 0 ? '品牌 AI 答案占有率下降（推断）' : '品牌 AI 答案占有率持平（推断）',
    })
  }

  const bPres = baseline.promptsTotal > 0 ? Math.round((baseline.promptsPresent / baseline.promptsTotal) * 100) : null
  const rPres = retest.promptsTotal > 0 ? Math.round((retest.promptsPresent / retest.promptsTotal) * 100) : null
  if (bPres !== null && rPres !== null) {
    const d = rPres - bPres
    rows.push({
      metricName: 'probe.brand_presence',
      baselineValue: `${bPres}%`,
      retestValue: `${rPres}%`,
      delta: signed(d),
      interpretation: d > 0 ? '品牌在 AI 回答中出现率上升（推断，n=5 方向性）' : d < 0 ? '品牌在 AI 回答中出现率下降（推断）' : '品牌出现率持平（推断）',
    })
  }

  return rows
}
