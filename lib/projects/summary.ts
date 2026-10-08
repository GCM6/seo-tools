// 项目列表页的纯逻辑（无 IO，可单测）。仓库层做 DB 读取后调这里定形。
import { isActiveRunStatus, isCompletedRunStatus } from '@/lib/runs/status'

export interface RunLike {
  id: string
  runType: string
  status: string
  startedAt: string | null
  finishedAt: string | null
}

// 排序用的时间：startedAt，没有就回落 finishedAt。2026-10-08 前建的基线 run 从不写 startedAt
// （只有回测路由写），只按 startedAt 排会让唯一带时间的回测抢走「最近一次」、回测锚点落到最早的基线。
const runTime = (r: RunLike) => r.startedAt ?? r.finishedAt ?? ''

// 从项目的全部 run 里挑「最近一次」：按 runTime 取最大者，两个时间都为 null 的排最后。
// 都为 null 时按传入顺序稳定回退（保底不抛）。空数组 → null。
export function pickLatestRun<T extends RunLike>(runs: T[]): T | null {
  if (runs.length === 0) return null
  return runs.reduce((best, cur) => (runTime(cur) > runTime(best) ? cur : best))
}

// 进行中的 run（spec §2.1 修订：status ∈ {draft,collecting,collected,diagnosing}）——
// 命中即禁止发起新 run/回测（并发保护）、前端渲染「诊断中…」态。有多条按 startedAt 取最新。
export function pickActiveRun<T extends RunLike>(runs: T[]): T | null {
  return pickLatestRun(runs.filter((r) => isActiveRunStatus(r.status)))
}

// 回测锚点：最新的 runType='baseline' 且已完成（status ∈ {reviewing,output}）的 run。
// 只在 baseline 里挑，不会被更晚但未完成/是 retest 的行抢占——即便存在更近的 retest 行。
export function pickRetestAnchor<T extends RunLike>(runs: T[]): T | null {
  return pickLatestRun(runs.filter((r) => r.runType === 'baseline' && isCompletedRunStatus(r.status)))
}
