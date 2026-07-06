// DataForSEO Labs keyword_overview：一次拿多词的搜索量 / 难度 / CPC / 意图
// （K03/K04 选词，E03 品牌词搜索量）。字段缺失一律降级为 null，不臆造。

import type { DataforseoClient } from './client'
import { asArray, asNumber, asRecord, asString } from './client'
import type { LabsKeywordDatum } from './types'

// keyword_overview live：请求体是数组，单元素携带 keywords[] + 地区/语言。
export async function keywordData(
  client: DataforseoClient,
  keywords: string[],
  opts: { locationCode: number; languageCode: string },
): Promise<LabsKeywordDatum[]> {
  if (keywords.length === 0) return []

  const body = [
    {
      keywords,
      location_code: opts.locationCode,
      language_code: opts.languageCode,
    },
  ]
  const tasks = await client.post('/v3/dataforseo_labs/google/keyword_overview/live', body)
  const result = asRecord(tasks[0]?.result[0])
  const items = result ? asArray(result.items) : []

  return items
    .map((raw): LabsKeywordDatum | null => {
      const item = asRecord(raw)
      const keyword = asString(item?.keyword)
      if (!keyword) return null
      const keywordInfo = asRecord(item?.keyword_info)
      const keywordProps = asRecord(item?.keyword_properties)
      const intentInfo = asRecord(item?.search_intent_info)
      return {
        keyword,
        searchVolume: asNumber(keywordInfo?.search_volume),
        difficulty: asNumber(keywordProps?.keyword_difficulty),
        cpc: asNumber(keywordInfo?.cpc),
        intent: asString(intentInfo?.main_intent),
      }
    })
    .filter((d): d is LabsKeywordDatum => d !== null)
}
