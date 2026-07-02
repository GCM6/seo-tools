// 探针回答的确定性解析器：纯字符串/URL 匹配，LLM 不参与，绝不生成数字。
// 改判定规则必须升 PROBE_PARSER_VERSION（协议留痕，保证跨 run 可比）。

export const PROBE_PARSER_VERSION = 'v1'

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
  return {
    brandPresent: mentions(answerText, brand) || answerText.toLowerCase().includes(domainToken),
    targetDomainCited: citesDomain(citedUrls, domain),
    competitorsMentioned: competitors.filter((c) => mentions(answerText, c)),
    citedUrls,
  }
}
