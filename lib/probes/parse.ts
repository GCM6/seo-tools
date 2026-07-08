// 探针回答的确定性解析器：纯字符串/URL 匹配，LLM 不参与，绝不生成数字。
// 改判定规则必须升 PROBE_PARSER_VERSION（协议留痕，保证跨 run 可比）。

import { classifyProbeSentiment, type ProbeSentiment } from './sentiment'

// v2：新增 G09 引用情感分类（sentiment），判定规则已变，故升版本。
// v3：SoV 竞品匹配改为聚合期对「确认竞品集」重解析原始回答（不再用探针期冻结的 competitorsMentioned）
//     + 分引擎 SoV。语义变更，跨版回测不可比（SP-A2 #6）。
export const PROBE_PARSER_VERSION = 'v3'

export interface ParseInput {
  answerText: string
  citedUrls: string[]
  brand: string
  domain: string
  competitors: string[]
}

export interface ParsedProbeAnswer {
  brandPresent: boolean
  targetDomainCited: boolean
  competitorsMentioned: string[]
  citedUrls: string[]
  sentiment: ProbeSentiment
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 拉丁词用词边界匹配（避免 metadocu 命中 metadocumentation）；
// CJK 品牌名没有词边界概念，用大小写不敏感子串匹配。
function mentions(text: string, term: string): boolean {
  if (!term) return false
  if (/[一-鿿぀-ヿ가-힯]/.test(term)) {
    return text.toLowerCase().includes(term.toLowerCase())
  }
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(text)
}

// 竞品命中：对给定竞品集逐个词/子串匹配答案文本。聚合期（aggregateProbeSummary）用它对
// 「当前确认竞品集」重解析原文，解掉探针期冻结（SP-A2 #6）。纯确定性、LLM 不参与。
export function competitorsInText(answerText: string, competitors: string[]): string[] {
  return competitors.filter((c) => mentions(answerText, c))
}

function normalizeHost(host: string): string {
  return host.replace(/^www\./, '').toLowerCase()
}

// 引用 URL 是否落在目标域名（含子域）；解析失败的 URL 忽略。
function citesDomain(urls: string[], domain: string): boolean {
  const target = normalizeHost(domain)
  return urls.some((u) => {
    try {
      const host = normalizeHost(new URL(u).hostname)
      return host === target || host.endsWith(`.${target}`)
    } catch {
      return false
    }
  })
}

export function parseProbeAnswer(input: ParseInput): ParsedProbeAnswer {
  const { answerText, citedUrls, brand, domain, competitors } = input
  const domainToken = normalizeHost(domain)
  const brandPresent = mentions(answerText, brand) || answerText.toLowerCase().includes(domainToken)
  return {
    brandPresent,
    targetDomainCited: citesDomain(citedUrls, domain),
    competitorsMentioned: competitorsInText(answerText, competitors),
    citedUrls,
    // 情感分类只在品牌出现时有意义；未出现一律 'neutral'。
    sentiment: brandPresent ? classifyProbeSentiment(answerText, brand) : 'neutral',
  }
}
