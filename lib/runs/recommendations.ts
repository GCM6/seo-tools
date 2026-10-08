import type { EvidenceGrade } from '@/lib/evidence'

// 建议的展示辅助（ux-blueprint §3.3 建议 / §3.4 执行清单）：纯函数，两页共用。

export type RecPriority = 'quick_win' | 'strategic' | 'fill_in' | 'low'
export const REC_PRIORITIES: RecPriority[] = ['quick_win', 'strategic', 'fill_in', 'low']

/** 未知优先级按「顺手补齐」处理（与旧 RecCard / ActionList 的兜底一致），不冒充更高优先级。 */
export function normalizePriority(priority: string): RecPriority {
  return (REC_PRIORITIES as string[]).includes(priority) ? (priority as RecPriority) : 'fill_in'
}

// lib/diagnosis/recommend.ts 把静态修复示例拼在 what 后面落库；展示时拆开，标题只留动作句，
// 示例代码进代码块（ux-blueprint §3.3：fixSnippet 不混进正文句子）。
export const STATIC_FIX_MARKER = '\n\n参考修复示例（静态模板，非生成内容）：\n'

export function splitRecommendation(what: string): { action: string; fixSnippet: string } {
  const at = what.indexOf(STATIC_FIX_MARKER)
  if (at === -1) return { action: what, fixSnippet: '' }
  return { action: what.slice(0, at), fixSnippet: what.slice(at + STATIC_FIX_MARKER.length) }
}

/** splitRecommendation 的逆操作：人工改了标题后，把原来的修复示例接回去，下游提示词不丢示例。 */
export function composeRecommendation(action: string, fixSnippet: string): string {
  return fixSnippet ? `${action}${STATIC_FIX_MARKER}${fixSnippet}` : action
}

/**
 * 「高（error 级，影响约 2 页/模板），修复对…」→「高」。行内只放级别，全文留在展开区；
 * 取不到 4 个字以内的级别时返回 null（行内不显示，不截断成半句话）。
 */
export function shortLevel(text: string | null | undefined): string | null {
  const s = (text ?? '').trim()
  if (!s) return null
  const head = s.split(/[（(，,；;\s]/)[0].trim()
  return head && head.length <= 4 ? head : null
}

export type RecFilter = 'all' | 'pending' | 'accepted' | 'rejected'
export const REC_FILTERS: RecFilter[] = ['all', 'pending', 'accepted', 'rejected']

/** 筛选口径：已编辑 = 改过再接受，归入「已接受」（只有 accepted / edited 能进执行清单）。 */
export function recFilterOf(status: string): Exclude<RecFilter, 'all'> {
  if (status === 'accepted' || status === 'edited') return 'accepted'
  if (status === 'rejected') return 'rejected'
  return 'pending'
}

export function countRecFilters(statuses: string[]): Record<RecFilter, number> {
  const counts: Record<RecFilter, number> = { all: statuses.length, pending: 0, accepted: 0, rejected: 0 }
  for (const s of statuses) counts[recFilterOf(s)] += 1
  return counts
}

const SEV_ORDER: Record<string, number> = { high: 0, hi: 0, mid: 1, ok: 2 }
const GRADE_ORDER: Record<EvidenceGrade, number> = { hard: 0, sample: 1, inferred: 2, hypothesis: 3 }

/** 组内排序：所针对问题的严重度优先，其次证据越硬越靠前；缺 finding 的排在最后。稳定排序。 */
export function rankRecs<T extends { severity?: string; grade?: EvidenceGrade }>(items: T[]): T[] {
  const sev = (it: T) => (it.severity ? (SEV_ORDER[it.severity] ?? 3) : 9)
  const grade = (it: T) => (it.grade ? GRADE_ORDER[it.grade] : 9)
  return [...items].sort((a, b) => sev(a) - sev(b) || grade(a) - grade(b))
}

/** 按优先级分组，组按 REC_PRIORITIES 顺序输出，空组省略。 */
export function groupByPriority<T extends { priority: string }>(items: T[]): { priority: RecPriority; items: T[] }[] {
  return REC_PRIORITIES.map((priority) => ({
    priority,
    items: items.filter((it) => normalizePriority(it.priority) === priority),
  })).filter((g) => g.items.length > 0)
}
