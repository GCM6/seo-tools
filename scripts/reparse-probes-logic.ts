// D8（GEO branded/unbranded 重设计 历史回填）：纯逻辑层，无 IO。
// 复用 lib/probes/parse.ts 的 v4 解析器与 mentions，对历史 prompts / ai_probe_results
// 重新计算 branded / brandPresent / targetDomainCited / competitorsMentioned / sentiment /
// hedged / unknownAdmission / parserVersion，供 scripts/reparse-probes.ts 的薄 IO 壳调用。
// 但 D8 白名单只允许回填 brandPresent/hedged/unknownAdmission/parserVersion 这 4 列
// （targetDomainCited/competitorsMentioned/sentiment 依赖 project 当前上下文，不回填也不计入
// diff 统计——见下方 ProbeRowDiff 与 buildProbeUpdatePayload 的注释）。
// 证据不可变原则：本文件只产出「应该写成什么」的纯计算结果，不碰 evidence_artifacts 任何字段。

import { parseProbeAnswer, PROBE_PARSER_VERSION, mentions, type ParsedProbeAnswer } from '@/lib/probes/parse'

export type SupportedProvider = 'openai' | 'perplexity' | 'gemini' | 'deepseek'

// —— 各 provider 原始响应结构（镜像 lib/probes/providers/{openai,perplexity,gemini,deepseek}.ts）——
interface OpenAiRaw {
  output?: { type?: string; content?: { type?: string; text?: string; annotations?: { type?: string; url?: string }[] }[] }[]
}
interface PerplexityRaw {
  choices?: { message?: { content?: string } }[]
  citations?: string[]
  search_results?: { url?: string }[]
}
interface GeminiRaw {
  candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] } }[]
}
interface DeepseekRaw {
  choices?: { message?: { content?: string } }[]
}

export interface ExtractedFromRaw {
  answerText: string
  citedUrls: string[]
}

// 从历史 evidence_artifacts.raw_text（JSON.stringify 后的 provider rawResponse）按 provider
// 重新提取 answerText / citedUrls——与各 provider 适配器实时调用时的抽取逻辑保持同一口径，
// 不复制该逻辑到运行时路径，只在这里为回填场景重跑一遍（payload 缺 citedUrls 时的兜底）。
export function extractFromRaw(provider: string, rawResponse: unknown): ExtractedFromRaw {
  switch (provider as SupportedProvider) {
    case 'openai': {
      const raw = rawResponse as OpenAiRaw
      const textParts: string[] = []
      const citedUrls: string[] = []
      for (const item of raw.output ?? []) {
        if (item.type !== 'message') continue
        for (const part of item.content ?? []) {
          if (part.type !== 'output_text') continue
          if (part.text) textParts.push(part.text)
          for (const a of part.annotations ?? []) {
            if (a.type === 'url_citation' && a.url) citedUrls.push(a.url)
          }
        }
      }
      return { answerText: textParts.join(''), citedUrls }
    }
    case 'perplexity': {
      const raw = rawResponse as PerplexityRaw
      const fromCitations = raw.citations ?? []
      const fromSearchResults = (raw.search_results ?? []).map((r) => r.url).filter((u): u is string => Boolean(u))
      return { answerText: raw.choices?.[0]?.message?.content ?? '', citedUrls: [...fromCitations, ...fromSearchResults] }
    }
    case 'gemini': {
      const raw = rawResponse as GeminiRaw
      const candidate = raw.candidates?.[0]
      return {
        answerText: (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
        citedUrls: (candidate?.groundingMetadata?.groundingChunks ?? [])
          .map((c) => c.web?.uri)
          .filter((u): u is string => Boolean(u)),
      }
    }
    case 'deepseek': {
      // DeepSeek 开放 API 结构上无引用能力，citedUrls 恒空（spec D8 / providers/deepseek.ts:42）。
      const raw = rawResponse as DeepseekRaw
      return { answerText: raw.choices?.[0]?.message?.content ?? '', citedUrls: [] }
    }
    default:
      return { answerText: '', citedUrls: [] }
  }
}

export interface ProbePayloadLike {
  answerText?: unknown
  citedUrls?: unknown
}

// payload 里已有 answerText/citedUrls 就直接用；citedUrls 缺失（非数组）时按 provider 从
// rawText 重提取兜底（spec D8）。answerText 理论上不会缺（payload 非空即为成功探针的落库），
// 但同样兜底，保持两个字段处理方式一致、不留隐性假设。
export function resolveAnswerAndCitedUrls(
  provider: string,
  payload: ProbePayloadLike | null | undefined,
  rawText: string,
): ExtractedFromRaw {
  const payloadAnswerText = typeof payload?.answerText === 'string' ? payload.answerText : undefined
  const payloadCitedUrls = Array.isArray(payload?.citedUrls) ? (payload.citedUrls as string[]) : undefined

  if (payloadAnswerText !== undefined && payloadCitedUrls !== undefined) {
    return { answerText: payloadAnswerText, citedUrls: payloadCitedUrls }
  }

  let rawResponse: unknown
  try {
    rawResponse = rawText ? JSON.parse(rawText) : undefined
  } catch {
    rawResponse = undefined
  }
  const extracted = rawResponse !== undefined ? extractFromRaw(provider, rawResponse) : { answerText: '', citedUrls: [] }
  return {
    answerText: payloadAnswerText ?? extracted.answerText,
    citedUrls: payloadCitedUrls ?? extracted.citedUrls,
  }
}

export interface ProbeRowExisting {
  brandPresent: boolean
  targetDomainCited: boolean
  competitorsMentioned: string[]
  sentiment: string
  hedged: boolean
  unknownAdmission: boolean
  parserVersion: string
}

export interface ProbeRowInput {
  id: string
  provider: string
  brand: string
  domain: string
  competitors: string[]
  aliases: string[]
  payload: ProbePayloadLike | null | undefined
  rawText: string
  existing: ProbeRowExisting
}

// D8 白名单（spec 2026-07-13-geo-branded-unbranded-redesign.md §D8）：回填脚本只允许
// 重算并写回这 4 列。targetDomainCited/competitorsMentioned/sentiment 虽然也在 parsed 里
// 一并算出（parseProbeAnswer 的返回值本就是四者共用一次调用），但它们依赖 project 当前
// 竞品集/域名等「今天的」上下文，不是探针期冻结事实的回填对象——不得进入 diff 的
// changed 统计，也不得出现在 apply 写库 payload 里，否则用户在 baseline 后编辑竞品列表
// 再跑 --apply 会用当天的竞品集覆写历史基线的 competitors_mentioned。
export interface ProbeRowDiff {
  id: string
  provider: string
  parsed: ParsedProbeAnswer
  brandPresentChanged: boolean
  hedgedChanged: boolean
  unknownAdmissionChanged: boolean
  parserVersionChanged: boolean
  anyChanged: boolean
}

// 单条 ai_probe_results 重解析：用 v4 parseProbeAnswer 重算，与旧值逐字段比对出 diff。
// 纯函数——不碰 evidence_artifacts，输入即历史证据的只读投影。
export function reparseProbeRow(input: ProbeRowInput): ProbeRowDiff {
  const { answerText, citedUrls } = resolveAnswerAndCitedUrls(input.provider, input.payload, input.rawText)
  const parsed = parseProbeAnswer({
    answerText,
    citedUrls,
    brand: input.brand,
    domain: input.domain,
    competitors: input.competitors,
    aliases: input.aliases,
  })

  const brandPresentChanged = parsed.brandPresent !== input.existing.brandPresent
  const hedgedChanged = parsed.hedged !== input.existing.hedged
  const unknownAdmissionChanged = parsed.unknownAdmission !== input.existing.unknownAdmission
  const parserVersionChanged = PROBE_PARSER_VERSION !== input.existing.parserVersion

  return {
    id: input.id,
    provider: input.provider,
    parsed,
    brandPresentChanged,
    hedgedChanged,
    unknownAdmissionChanged,
    parserVersionChanged,
    anyChanged: brandPresentChanged || hedgedChanged || unknownAdmissionChanged || parserVersionChanged,
  }
}

// D8 白名单写库 payload 构造器：把 diff 收窄成「只含允许写的 4 列」的更新对象，供
// scripts/reparse-probes.ts 的 IO 壳直接传给 db.update(...).set(...)。单独导出成纯函数是
// 为了能在不连 DB 的单测里断言「payload 里没有 competitorsMentioned/targetDomainCited/
// sentiment 这些键」，而不必依赖读源码 review。
export interface ProbeUpdatePayload {
  brandPresent: boolean
  hedged: boolean
  unknownAdmission: boolean
  parserVersion: string
}

export function buildProbeUpdatePayload(diff: ProbeRowDiff): ProbeUpdatePayload {
  return {
    brandPresent: diff.parsed.brandPresent,
    hedged: diff.parsed.hedged,
    unknownAdmission: diff.parsed.unknownAdmission,
    parserVersion: PROBE_PARSER_VERSION,
  }
}

export interface PromptRowInput {
  id: string
  text: string
  brand: string
  aliases: string[]
  existingBranded: boolean
}

export interface PromptRowDiff {
  id: string
  branded: boolean
  changed: boolean
}

// 单条 prompts 重判定：branded = mentions(text, brand) || 别名任一命中（D1/D7 同口径，
// 与 lib/probes/prompt-set.ts 的 isBranded 表达式一致，只复用其唯一依赖 mentions，不复制解析实现）。
export function reparsePromptRow(input: PromptRowInput): PromptRowDiff {
  const branded = mentions(input.text, input.brand) || input.aliases.some((a) => mentions(input.text, a))
  return { id: input.id, branded, changed: branded !== input.existingBranded }
}

export interface ProviderDiffStat {
  total: number
  brandPresentFlips: number
  hedgedTrue: number
  unknownAdmissionTrue: number
  anyChanged: number
}

export interface ProbeDiffSummary {
  totalRows: number
  anyChangedRows: number
  brandPresentFlips: number
  hedgedTrue: number
  unknownAdmissionTrue: number
  byProvider: Record<string, ProviderDiffStat>
}

// 差异统计聚合：dry-run 报告与 apply 后二次 dry-run（幂等证明）共用同一函数。
export function summarizeProbeDiffs(diffs: ProbeRowDiff[]): ProbeDiffSummary {
  const byProvider: Record<string, ProviderDiffStat> = {}
  let brandPresentFlips = 0
  let hedgedTrue = 0
  let unknownAdmissionTrue = 0
  let anyChangedRows = 0

  for (const d of diffs) {
    const stat =
      byProvider[d.provider] ??
      (byProvider[d.provider] = { total: 0, brandPresentFlips: 0, hedgedTrue: 0, unknownAdmissionTrue: 0, anyChanged: 0 })
    stat.total++
    if (d.brandPresentChanged) {
      brandPresentFlips++
      stat.brandPresentFlips++
    }
    if (d.parsed.hedged) {
      hedgedTrue++
      stat.hedgedTrue++
    }
    if (d.parsed.unknownAdmission) {
      unknownAdmissionTrue++
      stat.unknownAdmissionTrue++
    }
    if (d.anyChanged) {
      anyChangedRows++
      stat.anyChanged++
    }
  }

  return { totalRows: diffs.length, anyChangedRows, brandPresentFlips, hedgedTrue, unknownAdmissionTrue, byProvider }
}

export interface PromptDiffSummary {
  totalRows: number
  changedRows: number
  brandedTrue: number
}

export function summarizePromptDiffs(diffs: PromptRowDiff[]): PromptDiffSummary {
  return {
    totalRows: diffs.length,
    changedRows: diffs.filter((d) => d.changed).length,
    brandedTrue: diffs.filter((d) => d.branded).length,
  }
}
