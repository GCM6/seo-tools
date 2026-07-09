// run 状态划分（全项目统一，spec §2.1 修订）。
// runs.status='output' 在现有代码中从未被赋值——正常收尾停在 'reviewing'
// （lib/inngest/generate-findings.ts:195），故「完成态」必须同时含 reviewing 与 output，
// 否则回测入口永远不出现。failed 是独立终态，不计入 active 也不计入 completed。
import type { RunStatus } from '@/lib/types'

export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ['draft', 'collecting', 'collected', 'diagnosing']
export const COMPLETED_RUN_STATUSES: readonly RunStatus[] = ['reviewing', 'output']

export const isActiveRunStatus = (s: string): boolean => (ACTIVE_RUN_STATUSES as readonly string[]).includes(s)
export const isCompletedRunStatus = (s: string): boolean => (COMPLETED_RUN_STATUSES as readonly string[]).includes(s)
