// GSC 展示量加权平均排名：sum(position_i * impressions_i) / sum(impressions_i)。
// GSC「平均排名」的标准口径。总展示量 <= 0（空行/零展示）→ null（无信号，卡保持 pending）。
export function impressionWeightedAvgPosition(
  rows: { impressions: number; position: number }[],
): number | null {
  let weighted = 0
  let totalImpr = 0
  for (const r of rows) {
    const impr = typeof r.impressions === 'number' ? r.impressions : 0
    const pos = typeof r.position === 'number' ? r.position : 0
    weighted += pos * impr
    totalImpr += impr
  }
  if (totalImpr <= 0) return null
  return Math.round((weighted / totalImpr) * 10) / 10
}
