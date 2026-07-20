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

// —— B1：受影响页面清单（P0-4）——
// hit.detail 只在生成期（内存中的 RuleHit）可得，findings/recommendations 表都没有 detail 列
// （db schema 只读，不新增列）。因此在此处一次性把受影响 URL 清单序列化进持久化的 why 文本，
// 用可解析的标记包裹；报告/UI 渲染层（action-report-markdown.ts、ActionList.tsx）用
// extractAffectedPagesSection 原样解析回结构化数据，全程不依赖任何新 DB 字段。
export interface AffectedPages {
  total: number
  sample: string[]
}

function looksLikeUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

// detail 中可能承载「总数」的计数字段（与 recommend.ts 顶部 COUNT_KEYS 分开维护：那里是给
// Impact×Effort 定级用，这里只用于「共 N 个」展示文案，字段集合按需更宽松）。
const AFFECTED_TOTAL_KEYS = ['blockedCount', 'count', 'affectedCount', 'pageCount', 'affectedPages', 'total'] as const

function affectedTotal(detail: Record<string, unknown>, fallback: number): number {
  for (const k of AFFECTED_TOTAL_KEYS) {
    const v = detail[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return fallback
}

// 从 detail 里已知的几种「URL/页面清单」形状中提取受影响 URL；覆盖 rules/technical.ts 与
// content.ts 中 examples/blockedUrls/sampleUrls（字符串数组或 {url,...} 对象数组）、K06 蚕食的
// queries[].pages[].url 嵌套形状，以及单页规则用 scope 本身即受影响 URL 的兜底。
// 未覆盖：TA01/TA02 等按话题群聚合、没有具体 URL 清单的规则——按设计不产出本节。
export function deriveAffectedPages(hit: RuleHit): AffectedPages | null {
  const detail = hit.detail
  const collected: string[] = []

  if (detail) {
    for (const key of ['blockedUrls', 'sampleUrls', 'examples'] as const) {
      const arr = detail[key]
      if (!Array.isArray(arr) || arr.length === 0) continue
      for (const item of arr) {
        if (looksLikeUrl(item)) collected.push(item)
        else if (item && typeof item === 'object' && looksLikeUrl((item as Record<string, unknown>).url)) {
          collected.push((item as Record<string, unknown>).url as string)
        }
      }
      if (collected.length) break // 命中优先级最高的字段即止，避免多字段重复堆叠
    }

    if (collected.length === 0 && Array.isArray(detail.queries)) {
      for (const q of detail.queries) {
        const pages = (q as Record<string, unknown> | null)?.pages
        if (!Array.isArray(pages)) continue
        for (const p of pages) {
          const url = (p as Record<string, unknown> | null)?.url
          if (looksLikeUrl(url)) collected.push(url)
        }
      }
    }
  }

  if (collected.length === 0 && looksLikeUrl(hit.scope)) collected.push(hit.scope)

  if (collected.length === 0) return null
  const uniq = [...new Set(collected)]
  return { total: affectedTotal(detail ?? {}, uniq.length), sample: uniq.slice(0, 20) }
}

const AFFECTED_PAGES_PREFIX = '\n\n受影响页面（共 '

// 把受影响页面清单以可解析的固定格式追加到 why 文本末尾；无清单时原样返回。
export function appendAffectedPagesSection(why: string, affected: AffectedPages | null): string {
  if (!affected) return why
  const lines = affected.sample.map((url) => `- ${url}`).join('\n')
  return `${why}${AFFECTED_PAGES_PREFIX}${affected.total} 个，已列前 ${affected.sample.length} 个）：\n${lines}`
}

export interface AffectedPagesSection {
  total: number
  shown: number
  urls: string[]
}

const AFFECTED_PAGES_PATTERN = /^(\d+) 个，已列前 (\d+) 个）：\n([\s\S]*)$/

// appendAffectedPagesSection 的逆运算：从持久化的 why 文本里把受影响页面清单解析出来，并返回
// 去掉该清单后的干净 why。供 action-report-markdown.ts 与 ActionList.tsx 复用，两处渲染口径统一。
export function extractAffectedPagesSection(why: string): { why: string; affected: AffectedPagesSection | null } {
  const idx = why.indexOf(AFFECTED_PAGES_PREFIX)
  if (idx < 0) return { why, affected: null }
  const head = why.slice(0, idx)
  const rest = why.slice(idx + AFFECTED_PAGES_PREFIX.length)
  const match = rest.match(AFFECTED_PAGES_PATTERN)
  if (!match) return { why: head, affected: null }
  const urls = match[3]
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter(Boolean)
  return { why: head, affected: { total: Number(match[1]), shown: Number(match[2]), urls } }
}

// 单条命中 → 建议草稿：查模板（无则按 side 兜底），套 Impact×Effort 四象限，全部中文文案。
export function generateRecommendation(hit: RuleHit, ctx?: { domain?: string }): RecommendationDraft {
  void ctx
  const tpl = templates[hit.ruleId] ?? genericTemplate(hit.side)
  const impact = impactLevel(hit)
  const priority = priorityQuadrant(impact, tpl.effort)

  // fixSnippet 静态示例并入 what，随建议落库并进入 prompt（技术类核心交付物）。
  const what = tpl.fixSnippet ? `${tpl.what}\n\n参考修复示例（静态模板，非生成内容）：\n${tpl.fixSnippet}` : tpl.what
  const whyBase = tpl.whyHint ? `${hit.description} ${tpl.whyHint}` : hit.description
  // B1（P0-4）：把命中侧算出的受影响 URL 清单一并序列化进 why，随建议落库；
  // 报告/UI 渲染层用 extractAffectedPagesSection 解析回结构化清单（见上方函数注释）。
  const why = appendAffectedPagesSection(whyBase, deriveAffectedPages(hit))

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
