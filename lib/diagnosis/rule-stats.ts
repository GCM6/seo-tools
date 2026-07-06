// Phase F F3 内部效果统计：按 rule_id 聚合 dismiss / ineffective，用 Wilson 下限做小样本纪律，
// 越阈值则产 modify_threshold 提案草稿（作为开发工单）。全部纯函数。
// 注：Phase C 无现成 Wilson 工具，此处自实现（spec §4 的「复用」假设有误）。

/** Wilson score 区间下限（默认 z=1.96 即 95%）。小样本时显著低于点估计，抑制噪声信号。 */
export function wilsonLowerBound(successes: number, total: number, z = 1.96): number {
  if (total <= 0) return 0
  const phat = successes / total
  const z2 = z * z
  const denom = 1 + z2 / total
  const centre = phat + z2 / (2 * total)
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total)
  return Math.max(0, (centre - margin) / denom)
}

export interface FindingStatRecord {
  id: string
  ruleId: string
  status: 'open' | 'dismissed' | 'converted'
}

export interface RecStatRecord {
  id: string
  ruleId: string
  outcome: 'unknown' | 'effective' | 'ineffective' | 'regressed'
}

export interface RuleStatsOptions {
  nMin?: number
  dismissThreshold?: number
  ineffectiveThreshold?: number
}

export interface RuleStatsProposalDraft {
  source: 'dismissal_stats' | 'effectiveness_stats'
  changeType: 'modify_threshold'
  target: string
  evidenceRefs: string[]
  diff: { signal: 'high_dismiss_rate' | 'low_effectiveness'; sampleSize: number; rate: number; wilsonLower: number }
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = m.get(k) ?? []
    list.push(r)
    m.set(k, list)
  }
  return m
}

/** findings/recommendations 按 rule_id 聚合，越 Wilson 下限阈值则产提案草稿。evidence = 参与聚合的 id 列表。 */
export function aggregateRuleStats(
  findings: FindingStatRecord[],
  recs: RecStatRecord[],
  opts: RuleStatsOptions = {},
): RuleStatsProposalDraft[] {
  const nMin = opts.nMin ?? 20
  const dismissThreshold = opts.dismissThreshold ?? 0.5
  const ineffectiveThreshold = opts.ineffectiveThreshold ?? 0.6
  const drafts: RuleStatsProposalDraft[] = []

  // dismissal 率：dismissed / 该规则全部 findings
  for (const [ruleId, rows] of groupBy(findings, (f) => f.ruleId)) {
    const total = rows.length
    if (total < nMin) continue
    const dismissed = rows.filter((r) => r.status === 'dismissed').length
    const lower = wilsonLowerBound(dismissed, total)
    if (lower > dismissThreshold) {
      drafts.push({
        source: 'dismissal_stats',
        changeType: 'modify_threshold',
        target: ruleId,
        evidenceRefs: rows.map((r) => r.id),
        diff: { signal: 'high_dismiss_rate', sampleSize: total, rate: dismissed / total, wilsonLower: lower },
      })
    }
  }

  // ineffective 率：(ineffective + regressed) / 已判 outcome（!= unknown）的建议
  const judged = recs.filter((r) => r.outcome !== 'unknown')
  for (const [ruleId, rows] of groupBy(judged, (r) => r.ruleId)) {
    const total = rows.length
    if (total < nMin) continue
    const ineffective = rows.filter((r) => r.outcome === 'ineffective' || r.outcome === 'regressed').length
    const lower = wilsonLowerBound(ineffective, total)
    if (lower > ineffectiveThreshold) {
      drafts.push({
        source: 'effectiveness_stats',
        changeType: 'modify_threshold',
        target: ruleId,
        evidenceRefs: rows.map((r) => r.id),
        diff: { signal: 'low_effectiveness', sampleSize: total, rate: ineffective / total, wilsonLower: lower },
      })
    }
  }

  return drafts
}
