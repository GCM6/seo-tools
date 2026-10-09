import type { IssueDecision, IssueDetection, IssueStatus, RetiredReason } from './types'

export interface StatusInput {
  decision: IssueDecision
  executedAt: string | null
  detection: IssueDetection
  // 最近一次真正查过本问题的体检的开始时间。
  lastCheckedAt: string | null
  retiredReason: RetiredReason | null
}

const ms = (iso: string | null): number => (iso ? Date.parse(iso) : Number.NaN)

// 展示状态（spec 4.2）。顺序即优先级：排除优先（4.4-9）→ 已关闭 → 按决定 / 执行 / 检测推出。
export function deriveStatus(i: StatusInput): IssueStatus {
  if (i.decision === 'deferred' || i.decision === 'false_positive') return 'excluded'
  if (i.retiredReason) return 'retired'
  if (i.decision === 'pending') return i.detection === 'present' ? 'pending' : 'self_resolved'
  if (!i.executedAt) return i.detection === 'present' ? 'to_execute' : 'self_resolved'
  // 4.4-2：只认执行之后开始的体检；没有这样的体检（或时间无法比较）→ 已执行，待复查。
  const executed = ms(i.executedAt)
  const checked = ms(i.lastCheckedAt)
  if (!Number.isFinite(executed) || !Number.isFinite(checked) || checked < executed) return 'executed_awaiting'
  return i.detection === 'present' ? 'not_effective' : 'fixed'
}
