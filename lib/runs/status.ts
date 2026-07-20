// run 状态划分（全项目统一，spec §2.1 修订）。
// 长任务收尾停在 'reviewing'（lib/inngest/generate-findings.ts:195）；'output' 由
// app/api/recommendations/[id]/route.ts 在该 run 的全部建议都已人工处理完（无 draft）
// 时才回填。因此「完成态」必须同时含 reviewing 与 output，否则未触发过这次回填的 run
// 会在回测入口消失。failed 是独立终态，不计入 active 也不计入 completed。
import type { RunStatus } from '@/lib/types'

// A user-stop is stored as a failed run for now so it remains compatible with
// the existing database status constraint, while still being distinguishable
// from an execution failure in the UI and workflow guards.
export const RUN_CANCELLED_REASON = 'cancelled_by_user'

export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ['draft', 'collecting', 'collected', 'diagnosing']
export const COMPLETED_RUN_STATUSES: readonly RunStatus[] = ['reviewing', 'output']

export const isActiveRunStatus = (s: string): boolean => (ACTIVE_RUN_STATUSES as readonly string[]).includes(s)
export const isCompletedRunStatus = (s: string): boolean => (COMPLETED_RUN_STATUSES as readonly string[]).includes(s)
