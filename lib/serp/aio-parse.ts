// AIO 查询结果的确定性解析：从 references[] 取引用 URL、判定目标域名是否被 AI Overview 引用。
// 域名匹配复用 lib/probes/parse.ts 的 hostMatchesDomain（唯一实现），不重复一套子域名判定逻辑
// （任务书显式要求）。零 LLM，纯字符串/URL 匹配。
//
// 改判定规则必须升 AIO_PARSER_VERSION（协议留痕，保证跨 run 可比，与 PROBE_PARSER_VERSION 同一先例）。
export const AIO_PARSER_VERSION = 'v1'

import { hostMatchesDomain } from '@/lib/probes/parse'
import type { AioReference } from './dataforseo'

export interface ParseAioInput {
  aioPresent: boolean
  references: AioReference[]
  domain: string
}

export interface ParsedAioResult {
  aioPresent: boolean
  targetDomainCited: boolean
  citedUrls: string[]
}

export function parseAioResult(input: ParseAioInput): ParsedAioResult {
  const citedUrls = input.references.map((r) => r.url).filter((u): u is string => Boolean(u))
  const targetDomainCited =
    input.aioPresent &&
    citedUrls.some((u) => {
      try {
        return hostMatchesDomain(new URL(u).hostname, input.domain)
      } catch {
        return false
      }
    })
  return { aioPresent: input.aioPresent, targetDomainCited, citedUrls }
}
