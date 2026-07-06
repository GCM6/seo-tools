// DataForSEO Backlinks summary：外链概况（A01 referring_domains/backlinks/rank、
// A02 锚文本、A03 增长节奏）。own + 每个确认竞品各取一条。
// 说明：summary/live 端点主打聚合指标；精确锚文本列表与 new/lost 历史需另打
// /v3/backlinks/anchors/live 与 history 端点——本期不取，取不到分别降级为 [] / null。

import type { DataforseoClient } from './client'
import { asArray, asNumber, asRecord, asString } from './client'
import type { BacklinksSummary } from './types'

type Anchor = { anchor: string; count: number; dofollow: boolean }

// 防御式提取锚文本：summary 若返回 anchors 数组则映射，否则 []（走独立端点是后续工作）。
function extractAnchors(result: Record<string, unknown> | null): Anchor[] {
  return asArray(result?.anchors)
    .map((raw): Anchor | null => {
      const rec = asRecord(raw)
      const anchor = asString(rec?.anchor)
      const count = asNumber(rec?.backlinks) ?? asNumber(rec?.count)
      if (!anchor || count === null) return null
      // dofollow 计数 >0 视为存在 dofollow 锚；字段缺失按 false。
      const dofollow = (asNumber(rec?.dofollow) ?? 0) > 0
      return { anchor, count, dofollow }
    })
    .filter((a): a is Anchor => a !== null)
}

export async function backlinksSummary(client: DataforseoClient, target: string): Promise<BacklinksSummary> {
  const body = [
    {
      target,
      internal_list_limit: 10,
      backlinks_status_type: 'live',
    },
  ]
  const tasks = await client.post('/v3/backlinks/summary/live', body)
  const result = asRecord(tasks[0]?.result[0])

  return {
    target,
    referringDomains: asNumber(result?.referring_domains) ?? 0,
    backlinks: asNumber(result?.backlinks) ?? 0,
    rank: asNumber(result?.rank),
    anchors: extractAnchors(result),
    // new/lost 历史窗口 summary 不提供 → null（需 backlinks/history 端点）。
    newLost: null,
  }
}
