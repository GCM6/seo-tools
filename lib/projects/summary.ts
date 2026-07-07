// 项目列表页的纯逻辑（无 IO，可单测）。仓库层做 DB 读取后调这里定形。

export interface RunLike {
  id: string
  runType: string
  status: string
  startedAt: string | null
  finishedAt: string | null
}

// 从项目的全部 run 里挑「最近一次」：优先 startedAt 大者，startedAt 为 null 的排最后。
// 都为 null 时按传入顺序稳定回退（保底不抛）。空数组 → null。
export function pickLatestRun<T extends RunLike>(runs: T[]): T | null {
  if (runs.length === 0) return null
  return runs.reduce((best, cur) => {
    const b = best.startedAt ?? ''
    const c = cur.startedAt ?? ''
    return c > b ? cur : best
  })
}
