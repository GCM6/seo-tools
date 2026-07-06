import { sha256Hex } from '@/lib/collection/hash'
import type { Rule, RuleContext, RuleHit, RuleHitDraft } from './types'

// fingerprint = hash(rule_id + 归一化作用域)，跨 run 对齐 finding 身份（spec §5 finding 跨 run 身份）。
export function fingerprint(ruleId: string, scope: string): string {
  return sha256Hex(`${ruleId}::${scope.trim().toLowerCase()}`)
}

function stamp(rule: Rule, draft: RuleHitDraft): RuleHit {
  return {
    ...draft,
    ruleId: rule.id,
    pillar: rule.pillar,
    side: rule.side,
    severity: draft.severity ?? rule.severity,
    claimType: draft.claimType ?? rule.claimType,
    fingerprint: fingerprint(rule.id, draft.scope),
  }
}

// 规则引擎主体：确定性求值全部规则 → RuleHit[]。
// 铁律落地：① 单条规则抛错被吞，不沉没整轮诊断；② 引擎强制过滤空 evidenceRefs 的命中
//（证据先于结论，且 findings.evidence_refs 非空为 DB 约束，此处提前拦截避免落库报错）。
export function evaluateRules(ctx: RuleContext, rules: Rule[]): RuleHit[] {
  const hits: RuleHit[] = []
  for (const rule of rules) {
    let out: RuleHitDraft | RuleHitDraft[] | null = null
    try {
      out = rule.evaluate(ctx)
    } catch {
      out = null
    }
    if (!out) continue
    for (const draft of Array.isArray(out) ? out : [out]) {
      const refs = (draft.evidenceRefs ?? []).filter(Boolean)
      if (refs.length === 0) continue
      hits.push(stamp(rule, { ...draft, evidenceRefs: refs }))
    }
  }
  return hits
}
