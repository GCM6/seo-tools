import { stamp } from './engine'
import { unmetRequirements, type SourceKey } from './sources'
import { isNotChecked, type Rule, type RuleContext, type RuleEvaluation, type RuleHit } from './types'

export interface LedgerRow {
  ruleId: string
  ruleVersion: number
  outcome: 'hit' | 'clear' | 'not_checked' | 'error'
  reasonKind: 'data_gap' | 'site_condition' | 'unsupported' | 'error' | null
  reason: string | null
  hitCount: number
}

const describeUnmet = (reqs: ReturnType<typeof unmetRequirements>) =>
  `缺数据源：${reqs.map((r) => (Array.isArray(r) ? r.join(' 或 ') : r)).join('、')}`

// 检查台账（spec 2026-10-09 §5.1-1）：每条规则一行。数据源缺失时不执行规则；
// 规则抛错记 error；命中全部因证据引用为空被丢弃也记 error（不能当成「没查出」）。
export function evaluateRulesWithLedger(
  ctx: RuleContext,
  rules: Rule[],
  available: Set<SourceKey>,
): { hits: RuleHit[]; ledger: LedgerRow[] } {
  const hits: RuleHit[] = []
  const ledger: LedgerRow[] = []
  for (const rule of rules) {
    const row = (outcome: LedgerRow['outcome'], reasonKind: LedgerRow['reasonKind'] = null, reason: string | null = null, hitCount = 0) =>
      ledger.push({ ruleId: rule.id, ruleVersion: rule.version, outcome, reasonKind, reason, hitCount })

    const unmet = unmetRequirements(rule.requiredSources, available)
    if (unmet.length) {
      row('not_checked', 'data_gap', describeUnmet(unmet))
      continue
    }
    let out: RuleEvaluation
    try {
      out = rule.evaluate(ctx)
    } catch (err) {
      row('error', 'error', err instanceof Error ? err.message : String(err))
      continue
    }
    if (!out) {
      row('clear')
      continue
    }
    if (isNotChecked(out)) {
      row('not_checked', out.kind, out.reason)
      continue
    }
    const drafts = Array.isArray(out) ? out : [out]
    let valid = 0
    for (const draft of drafts) {
      const refs = (draft.evidenceRefs ?? []).filter(Boolean)
      if (refs.length === 0) continue
      hits.push(stamp(rule, { ...draft, evidenceRefs: refs }))
      valid += 1
    }
    if (valid > 0) row('hit', null, null, valid)
    else if (drafts.length > 0) row('error', 'error', 'empty_evidence_refs')
    else row('clear')
  }
  return { hits, ledger }
}
