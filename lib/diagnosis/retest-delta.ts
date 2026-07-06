import type { ValidationSpec } from './validation-spec'
import type { FindingSeverity } from './types'

// 回测 delta 纯逻辑（spec §5、§7.2 板块 8）——无 I/O，全部可单测。
// 回测执行器（Inngest）取 baseline/retest 两轮 findings + 建议 validation_spec + 标量指标后调用本模块。

// —— finding 跨 run 四态（按 fingerprint 对齐，spec §5）——
export type FindingDeltaState = 'resolved' | 'persistent' | 'new' | 'regressed'

// 严重度序：high(2) > mid(1) > ok(0)，用于判「变严重」。
const SEV_RANK: Record<FindingSeverity, number> = { high: 2, mid: 1, ok: 0 }

export interface FindingRef {
  fingerprint: string
  severity: FindingSeverity
  title?: string
}

export interface FindingDelta {
  fingerprint: string
  state: FindingDeltaState
  title: string
  baselineSeverity: FindingSeverity | null
  retestSeverity: FindingSeverity | null
}

// baseline vs retest 两组 finding → 四态清单。同 fingerprint 出现在两轮：
//   retest 更严重 → regressed；否则 → persistent。
//   仅 baseline → resolved；仅 retest → new。
export function computeFindingDelta(baseline: FindingRef[], retest: FindingRef[]): FindingDelta[] {
  const baseMap = new Map(baseline.map((f) => [f.fingerprint, f]))
  const retestMap = new Map(retest.map((f) => [f.fingerprint, f]))
  const out: FindingDelta[] = []

  for (const b of baseline) {
    const r = retestMap.get(b.fingerprint)
    if (!r) {
      out.push({ fingerprint: b.fingerprint, state: 'resolved', title: b.title ?? '', baselineSeverity: b.severity, retestSeverity: null })
    } else {
      const worse = SEV_RANK[r.severity] > SEV_RANK[b.severity]
      out.push({
        fingerprint: b.fingerprint,
        state: worse ? 'regressed' : 'persistent',
        title: r.title ?? b.title ?? '',
        baselineSeverity: b.severity,
        retestSeverity: r.severity,
      })
    }
  }
  for (const r of retest) {
    if (!baseMap.has(r.fingerprint)) {
      out.push({ fingerprint: r.fingerprint, state: 'new', title: r.title ?? '', baselineSeverity: null, retestSeverity: r.severity })
    }
  }
  return out
}

export interface FindingDeltaSummary {
  resolved: number
  persistent: number
  new: number
  regressed: number
}

export function summarizeFindingDelta(deltas: FindingDelta[]): FindingDeltaSummary {
  const s: FindingDeltaSummary = { resolved: 0, persistent: 0, new: 0, regressed: 0 }
  for (const d of deltas) s[d.state] += 1
  return s
}

// —— 建议 outcome 判定（spec §5 生命周期 + §9：恒 inferred，只由回测 delta 计算写入）——
export type RecommendationOutcome = 'unknown' | 'effective' | 'ineffective' | 'regressed'

// 标量指标对：baseline/retest 两轮的同名指标值（回测执行器按 validation_spec.metric 取；取不到传 null）。
export interface MetricPair {
  baseline: number
  retest: number
}

// 单条建议 outcome：
//   ① 有可比标量指标 → 按 validation_spec.direction 判方向（改善/持平/恶化）。
//   ② 无指标 → 退化用其对应 finding 的四态信号（resolved=effective / regressed=regressed /
//      persistent=ineffective / new|null=unknown）。指标优先，finding 四态兜底。
// 恒标 inferred（本函数只算枚举，claim 等级在展示层固定为「推断」；同期多建议时报告明示复合变更不归因单项）。
export function computeOutcome(
  spec: ValidationSpec | null,
  metric: MetricPair | null,
  findingState: FindingDeltaState | null,
): RecommendationOutcome {
  if (spec && metric && Number.isFinite(metric.baseline) && Number.isFinite(metric.retest)) {
    const improved = spec.direction === 'increase' ? metric.retest > metric.baseline : metric.retest < metric.baseline
    const worsened = spec.direction === 'increase' ? metric.retest < metric.baseline : metric.retest > metric.baseline
    return improved ? 'effective' : worsened ? 'regressed' : 'ineffective'
  }
  switch (findingState) {
    case 'resolved':
      return 'effective'
    case 'regressed':
      return 'regressed'
    case 'persistent':
      return 'ineffective'
    default:
      return 'unknown'
  }
}

// —— retest_snapshots 落库行构造（spec §6 表结构：metricName/baselineValue/retestValue/delta/interpretation）——
export interface RetestSnapshotRow {
  metricName: string
  baselineValue: string
  retestValue: string
  delta: string
  interpretation: string
}

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

// finding 四态汇总 + （可选）健康分 → 快照行。报告页 §8 直接渲染这些行回答「修好了几个」。
export function buildRetestSnapshotRows(
  summary: FindingDeltaSummary,
  health?: { baseline: number | null; retest: number | null },
): RetestSnapshotRow[] {
  const rows: RetestSnapshotRow[] = [
    { metricName: 'findings.resolved', baselineValue: '—', retestValue: String(summary.resolved), delta: signed(summary.resolved), interpretation: `已修复 ${summary.resolved} 项上次的问题` },
    { metricName: 'findings.persistent', baselineValue: '—', retestValue: String(summary.persistent), delta: String(summary.persistent), interpretation: `${summary.persistent} 项问题仍存在` },
    { metricName: 'findings.new', baselineValue: '—', retestValue: String(summary.new), delta: signed(summary.new), interpretation: `新出现 ${summary.new} 项问题` },
    { metricName: 'findings.regressed', baselineValue: '—', retestValue: String(summary.regressed), delta: signed(summary.regressed), interpretation: `${summary.regressed} 项问题变严重` },
  ]
  if (health && health.baseline !== null && health.retest !== null) {
    const d = Math.round((health.retest - health.baseline) * 10) / 10
    rows.push({
      metricName: 'health.overall',
      baselineValue: String(health.baseline),
      retestValue: String(health.retest),
      delta: signed(d),
      interpretation: d > 0 ? '健康分回升（推断，非实测）' : d < 0 ? '健康分下降（推断，非实测）' : '健康分持平（推断）',
    })
  }
  return rows
}
