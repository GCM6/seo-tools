import type { ClaimType } from '@/lib/types'
import type { RuleHit } from './types'
import { templates, genericTemplate, type PromptType, type Effort } from './templates'
import { deriveValidationSpec, type ValidationSpec } from './validation-spec'

// 建议草稿：generateRecommendation 的纯产物，字段对齐 recommendations 表（priority 存四象限标签）。
export interface RecommendationDraft {
  what: string
  why: string
  expectedImpact: string
  effort: string
  risk: string
  validationMethod: string
  // Impact×Effort 四象限：quick_win | strategic | fill_in | low（spec §5 step 4）。
  priority: string
  confidence: string
  evidenceRefs: string[]
  promptType: PromptType
  // 结构化验证口径（spec §5.1-2）：模板覆盖优先，否则按支柱派生。恒非空。
  validationSpec: ValidationSpec
}

export type PriorityQuadrant = 'quick_win' | 'strategic' | 'fill_in' | 'low'
type ImpactLevel = 'high' | 'low'

// detail 中可能承载受影响规模的计数字段；取到即用于放大 warning 的影响面。
const COUNT_KEYS = ['affectedCount', 'pageCount', 'count', 'templateCount', 'affectedPages', 'total'] as const

function affectedCount(detail?: Record<string, unknown>): number {
  if (!detail) return 0
  for (const k of COUNT_KEYS) {
    const v = detail[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return 0
}

// impact：error 恒 high；warning 视受影响规模升降（≥5 页/模板算 high）；notice 恒 low。
function impactLevel(hit: RuleHit): ImpactLevel {
  if (hit.severity === 'error') return 'high'
  if (hit.severity === 'warning') return affectedCount(hit.detail) >= 5 ? 'high' : 'low'
  return 'low'
}

// 四象限映射：high×low=quick_win，high×(mid|high)=strategic，low×high=low，low×(low|mid)=fill_in。
export function priorityQuadrant(impact: ImpactLevel, effort: Effort): PriorityQuadrant {
  if (impact === 'high') return effort === 'low' ? 'quick_win' : 'strategic'
  return effort === 'high' ? 'low' : 'fill_in'
}

const EFFORT_LABEL: Record<Effort, string> = { low: '低', mid: '中', high: '高' }

const CONFIDENCE_LABEL: Record<ClaimType, string> = {
  measured_hard: '高（实测）',
  measured_sample: '中（抽样实测）',
  inferred: '中低（推断）',
  hypothesis: '低（假设）',
}

function expectedImpactText(hit: RuleHit, impact: ImpactLevel): string {
  const n = affectedCount(hit.detail)
  const sevZh = hit.severity === 'error' ? 'error' : hit.severity === 'warning' ? 'warning' : 'notice'
  const scope = n > 0 ? `，影响约 ${n} 页/模板` : ''
  return impact === 'high'
    ? `高（${sevZh} 级${scope}），修复对该支柱得分与可见性影响显著`
    : `中低（${sevZh} 级${scope}），修复为增量改善`
}

function riskText(promptType: PromptType, hit: RuleHit): string {
  if (promptType === 'technical') {
    return '技术改动按 fixSnippet 精确修改、改后重新抓取回归，风险低；302/删除/合并类需先备份并核对内链。'
  }
  return hit.claimType === 'hypothesis' || hit.claimType === 'inferred'
    ? '内容改动需人工终审并遵守否定约束（禁堆词/禁编造）；本条依据为推断/假设级，落地后以数据验证。'
    : '内容改动需人工终审并遵守否定约束（禁堆词/禁编造）。'
}

// 单条命中 → 建议草稿：查模板（无则按 side 兜底），套 Impact×Effort 四象限，全部中文文案。
export function generateRecommendation(hit: RuleHit, ctx?: { domain?: string }): RecommendationDraft {
  void ctx
  const tpl = templates[hit.ruleId] ?? genericTemplate(hit.side)
  const impact = impactLevel(hit)
  const priority = priorityQuadrant(impact, tpl.effort)

  // fixSnippet 静态示例并入 what，随建议落库并进入 prompt（技术类核心交付物）。
  const what = tpl.fixSnippet ? `${tpl.what}\n\n参考修复示例（静态模板，非生成内容）：\n${tpl.fixSnippet}` : tpl.what
  const why = tpl.whyHint ? `${hit.description} ${tpl.whyHint}` : hit.description

  return {
    what,
    why,
    expectedImpact: expectedImpactText(hit, impact),
    effort: EFFORT_LABEL[tpl.effort],
    risk: tpl.risk ?? riskText(tpl.promptType, hit),
    validationMethod: tpl.validationMethod,
    priority,
    confidence: CONFIDENCE_LABEL[hit.claimType],
    evidenceRefs: hit.evidenceRefs,
    promptType: tpl.promptType,
    // 模板声明的 validationSpec 优先，否则按支柱派生（保证恒非空 → 建议可进 verifying）。
    validationSpec: deriveValidationSpec(hit, tpl.validationSpec),
  }
}
