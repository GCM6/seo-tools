export const COLLECT_REQUESTED_EVENT = 'veris/run.collect.requested' as const

export interface CollectRequestedEventData {
  runId: string
  projectId: string
  url: string
  // 回测（spec §5.1-3）：非空时本 run 是对 baselineRunId 的同协议重跑，穿线到 diagnose
  // 事件，generateFindings 完成后据此算 finding 四态 delta + 建议 outcome。
  baselineRunId?: string
}

export function buildCollectRequestedEvent(
  run: { id: string; projectId: string },
  url: string,
  baselineRunId?: string,
) {
  return {
    name: COLLECT_REQUESTED_EVENT,
    data: { runId: run.id, projectId: run.projectId, url, baselineRunId } satisfies CollectRequestedEventData,
  }
}

// —— 诊断生成链触发事件（spec §5：collectEvidence 完成后触发 generateFindings）——
export const DIAGNOSE_REQUESTED_EVENT = 'veris/run.diagnose.requested' as const

export interface DiagnoseRequestedEventData {
  runId: string
  projectId: string
  // 回测锚点（spec §5.1-3）：非空则 generateFindings 收尾时算 delta 落 retest_snapshots。
  baselineRunId?: string
}

export function buildDiagnoseRequestedEvent(data: DiagnoseRequestedEventData) {
  return {
    name: DIAGNOSE_REQUESTED_EVENT,
    data: {
      runId: data.runId,
      projectId: data.projectId,
      baselineRunId: data.baselineRunId,
    } satisfies DiagnoseRequestedEventData,
  }
}

// —— 竞品确认后增量再评估触发事件（Phase C 两段式诊断，spec §5.1-4）——
// 用户在 competitors 页确认/驳回后触发：只重算竞品依赖规则（K03-05/Q01-03/A01/E03/G04），
// 按 fingerprint 并入当前 run，不重跑采集、不改 run 状态（保持 reviewing）。
export const COMPETITORS_CONFIRMED_EVENT = 'veris/run.competitors.confirmed' as const

export interface CompetitorsConfirmedEventData {
  runId: string
  projectId: string
}

export function buildCompetitorsConfirmedEvent(data: CompetitorsConfirmedEventData) {
  return {
    name: COMPETITORS_CONFIRMED_EVENT,
    data: { runId: data.runId, projectId: data.projectId } satisfies CompetitorsConfirmedEventData,
  }
}
