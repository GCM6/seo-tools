// 诊断运行预估（向导第 3 步）。纯函数：由引擎数/prompt 数/n/数据源开关粗算探针调用数、
// 耗时区间、成本区间。**方向性预估**——显式标「预估」，不进任何 evidence/finding。
// 探针实际用量在 run 后有 raw 协议，V1 可回填「实际成本」。（spec §SP-G2a-2）
export interface EstimateInput {
  engineCount: number
  promptCount: number
  n: number
  gsc: boolean
  render: boolean
}

export interface RunEstimate {
  probeCalls: number
  timeLowMin: number
  timeHighMin: number
  costLowUsd: number
  costHighUsd: number
}

// 每次探针调用的成本带（美元）：混合了便宜/较贵模型的方向性区间。
const COST_PER_PROBE_LOW = 0.002
const COST_PER_PROBE_HIGH = 0.02
// 抓取/渲染/GSC 的固定前置开销（分钟）——即便零引擎也有底。
const BASE_OVERHEAD_MIN = 2
// 探针吞吐（次/分钟）：并发下限/上限，决定耗时区间。
const RATE_LOW = 40
const RATE_HIGH = 120

const round2 = (n: number) => Math.round(n * 100) / 100

export function estimateRun(input: EstimateInput): RunEstimate {
  const probeCalls = Math.max(0, input.engineCount) * input.promptCount * input.n
  const costLowUsd = round2(probeCalls * COST_PER_PROBE_LOW)
  const costHighUsd = round2(probeCalls * COST_PER_PROBE_HIGH)
  const timeLowMin = Math.max(1, Math.ceil(BASE_OVERHEAD_MIN + probeCalls / RATE_HIGH))
  const timeHighMin = Math.max(timeLowMin + 1, Math.ceil(BASE_OVERHEAD_MIN + probeCalls / RATE_LOW))
  return { probeCalls, timeLowMin, timeHighMin, costLowUsd, costHighUsd }
}
