// 探针回答的确定性解析器：纯字符串/URL 匹配，LLM 不参与，绝不生成数字。
// 改判定规则必须升 PROBE_PARSER_VERSION（协议留痕，保证跨 run 可比）。

import { classifyProbeSentiment, type ProbeSentiment } from './sentiment'

// v2：新增 G09 引用情感分类（sentiment），判定规则已变，故升版本。
// v3：SoV 竞品匹配改为聚合期对「确认竞品集」重解析原始回答（不再用探针期冻结的 competitorsMentioned）
//     + 分引擎 SoV。语义变更，跨版回测不可比（SP-A2 #6）。
// v4（GEO branded/unbranded 重设计 D2/D7）：
//   - 新增确定性词表检测 hedged（猜测标记）/ unknownAdmission（承认不知道），零 LLM；
//   - mentions 系匹配（brandPresent 判定）改为对 brand + aliases 逐一尝试（D7 品牌别名）。
// v5（代码审查修复，两处不对称）：
//   - sentiment 分类改为按 brand + aliases 判定品牌句（此前只认主品牌词，别名句情感恒判
//     neutral，G09 负面预警分子被系统性清零，见 sentiment.ts v5 注释）；
//   - unknownAdmission 改为对全文检测词表（此前限定品牌句，导致不复述品牌名的诚实拒答——
//     如"我没有找到相关信息，无法评价这家公司"——被误判为 unverified「断言式回答无依据」，
//     方向恰好相反。spec D2/D3 对 unknownAdmission 只定义词表，未要求限定品牌句；hedged 保持
//     限定品牌句不变，见下方 detectHedgeSignals 注释）。
// v6（引用口径拆分修复）：
//   - Perplexity provider 此前把「正文引用（citations[]）」与「仅被检索到（search_results[].url）」
//     压平合并进同一个 citedUrls，导致 targetDomainCited 与五态 grounded 判定虚高——引擎检索到
//     一个 URL 不等于正文真的依据了它。协议层（providers/*.ts）已拆成 citedUrls / retrievedUrls
//     两个字段，本文件的 citesDomain 判定语义不变，但输入的 citedUrls 现在只含真正的正文引用，
//     判定口径因此自动变严；新增 targetDomainRetrieved 对 retrievedUrls 独立判定，不参与
//     grounded 五态（五态继续只看 citedUrls，见 engine-capability.ts）。
// 升级词表本身（新增/删除/改判定范围）同样必须再升版本号（协议留痕，保证跨 run 可比）。
export const PROBE_PARSER_VERSION = 'v6'

export interface ParseInput {
  answerText: string
  citedUrls: string[]
  // v6：仅被引擎联网检索到、未在正文标注引用的 URL（见 providers/perplexity.ts 注释）。
  // 可选——旧调用方/测试不传即视为空数组，targetDomainRetrieved 恒 false，不影响既有行为。
  retrievedUrls?: string[]
  brand: string
  domain: string
  competitors: string[]
  // D7：品牌别名（project_settings.brand_aliases）。brandPresent / hedged / unknownAdmission
  // 判定时与 brand 逐一尝试匹配，任一命中即算命中。可选——旧调用方不传即视为无别名。
  aliases?: string[]
}

export interface ParsedProbeAnswer {
  brandPresent: boolean
  targetDomainCited: boolean
  competitorsMentioned: string[]
  citedUrls: string[]
  // v6：仅检索到、未在正文引用的 URL，原样透传（供落库与来源归属分类消费）。
  retrievedUrls: string[]
  // v6：retrievedUrls 里是否命中目标域名——比 targetDomainCited 弱一档，不参与 grounded 判定。
  targetDomainRetrieved: boolean
  sentiment: ProbeSentiment
  // D2：确定性词表检测，见下方 HEDGE_TERMS / UNKNOWN_ADMISSION_TERMS 及其校准注释。
  hedged: boolean
  unknownAdmission: boolean
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 拉丁词用词边界匹配（避免 metadocu 命中 metadocumentation）；
// CJK 品牌名没有词边界概念，用大小写不敏感子串匹配。
// 导出复用：prompt-set.ts 的 branded 判定对生成后的问题文本跑同一匹配口径（D1），不复制实现。
export function mentions(text: string, term: string): boolean {
  if (!term) return false
  if (/[一-鿿぀-ヿ가-힯]/.test(term)) {
    return text.toLowerCase().includes(term.toLowerCase())
  }
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(text)
}

// D7：品牌 + 别名逐一匹配，任一命中即算命中。brandPresent / hedged / unknownAdmission 共用。
function mentionsBrandOrAlias(text: string, brand: string, aliases: string[]): boolean {
  return mentions(text, brand) || aliases.some((a) => mentions(text, a))
}

// 竞品命中：对给定竞品集逐个词/子串匹配答案文本。聚合期（aggregateProbeSummary）用它对
// 「当前确认竞品集」重解析原文，解掉探针期冻结（SP-A2 #6）。纯确定性、LLM 不参与。
export function competitorsInText(answerText: string, competitors: string[]): string[] {
  return competitors.filter((c) => mentions(answerText, c))
}

// ── D2：hedged / unknownAdmission 确定性词表检测（v4，零 LLM）────────────────────
//
// hedged 词表只在「含品牌/别名的句子」内检测——与 sentiment.ts 的 classifyProbeSentiment 同一
// 先例（只看含品牌的句子），不对整段回答做全文匹配。原因：本地库 60 条真实 DeepSeek 探针回答
// （metadocu 测试项目）校准发现，不限定句子范围会把 20/60 答案误判为 hedged（"likely"/
// "might be" 大量出现在与品牌无关的通用建议句里，如 "which is likely under 20 people"）；
// 限定到品牌句后降到 6/60，且全部是真实的品牌身份猜测/编造语境（如 "MetaDocu (likely a
// portmanteau of ...)"）。校准脚本与 20 条真实样例见交付报告，未在仓库留痕（一次性脚本）。
//
// unknownAdmission 词表（v5 起）对全文检测，不限品牌句——诚实拒答常见"我没有找到相关信息，
// 无法评价这家公司"这类整句不提品牌名的表述，限定品牌句会系统性把诚实拒答误判为
// unverified「断言式回答无依据」。spec D2/D3 只定义词表本身，从未要求限定品牌句；上面的
// 品牌句校准只是为 hedged 误报问题量身定制，不适用于 unknownAdmission。
//
// 升级此词表（新增/删除词、改变检测范围）必须同步升 PROBE_PARSER_VERSION。
const CJK_RE = /[一-鿿぀-ヿ가-힯]/

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?。！？；;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// 猜测标记：模型对品牌一无所知时顺着名字/直觉臆测的措辞。
// 中英词表；英文里含空格/撇号的短语（如 "based on the name"）无法用 \b 精确包裹，
// 走大小写不敏感子串匹配（与 sentiment.ts hitsTerm 同一处理方式）。
const HEDGE_TERMS: readonly string[] = [
  // 拉丁（spec D2 列出的核心词 + 本地真实样例校准新增的等价表达）
  'likely',
  'probably',
  'presumably',
  'appears to be',
  'seems to be',
  'seem to be',
  'based on the name',
  'based on the term',
  'portmanteau',
  "it's possible that",
  'it is possible that',
  'might be',
  'closely resembles',
  // CJK
  '可能是',
  '大概',
  '推测',
  '顾名思义',
  '据推断',
]

// 承认不知道：模型明确表示无法给出信息（不同于猜测——猜测仍会往下编，这里是拒绝/坦白）。
const UNKNOWN_ADMISSION_TERMS: readonly string[] = [
  // 拉丁（spec D2 列出的核心词 + 本地真实样例校准新增的等价表达）
  "i'm not aware",
  'i am not aware',
  "don't have information",
  'do not have information',
  "don't have specific information",
  'do not have specific information',
  'do not have verified',
  'no information available',
  "couldn't find",
  'could not find',
  'cannot provide information',
  'cannot provide a specific',
  'not a well-known entity',
  'not widely recognized',
  'not a widely recognized',
  'no widely recognized',
  // CJK
  '没有找到',
  '不了解',
  '无法确认',
  '没有相关信息',
]

// 拉丁纯字母词用词边界匹配；含空格/撇号的短语退化为子串匹配；CJK 按子串匹配。
// 与 sentiment.ts 的 hitsTerm 思路一致，此处内联以保持本模块纯函数无外部依赖
// （sentiment.ts 未导出该私有函数，两处各自维护同一小段逻辑是有意为之）。
function hitsTerm(text: string, term: string): boolean {
  if (!term) return false
  if (CJK_RE.test(term)) return text.toLowerCase().includes(term.toLowerCase())
  if (!/^[a-z']+$/i.test(term)) return text.toLowerCase().includes(term.toLowerCase())
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(text)
}

function hitsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((t) => hitsTerm(text, t))
}

// hedged 只在含品牌/别名的句子内检测（品牌未出现于文中 → 恒 false，无从谈"猜测品牌"）；
// unknownAdmission 对全文检测，不要求品牌句命中（见上方注释）。
function detectHedgeSignals(
  answerText: string,
  brand: string,
  aliases: string[],
): { hedged: boolean; unknownAdmission: boolean } {
  const brandSentences = splitSentences(answerText).filter((s) => mentionsBrandOrAlias(s, brand, aliases))
  return {
    hedged: brandSentences.some((s) => hitsAny(s, HEDGE_TERMS)),
    unknownAdmission: hitsAny(answerText, UNKNOWN_ADMISSION_TERMS),
  }
}

function normalizeHost(host: string): string {
  return host.replace(/^www\./, '').toLowerCase()
}

// 域名匹配核心：host 是否等于目标域或其子域。导出复用：citation-origin.ts 的
// classifyCitationOrigin 用同一口径判定"自有域名"，不重复实现一套匹配逻辑。
export function hostMatchesDomain(host: string, domain: string): boolean {
  const target = normalizeHost(domain)
  const h = normalizeHost(host)
  return h === target || h.endsWith(`.${target}`)
}

// 引用 URL 是否落在目标域名（含子域）；解析失败的 URL 忽略。
function citesDomain(urls: string[], domain: string): boolean {
  return urls.some((u) => {
    try {
      return hostMatchesDomain(new URL(u).hostname, domain)
    } catch {
      return false
    }
  })
}

export function parseProbeAnswer(input: ParseInput): ParsedProbeAnswer {
  const { answerText, citedUrls, retrievedUrls = [], brand, domain, competitors, aliases = [] } = input
  const domainToken = normalizeHost(domain)
  const brandPresent = mentionsBrandOrAlias(answerText, brand, aliases) || answerText.toLowerCase().includes(domainToken)
  const { hedged, unknownAdmission } = detectHedgeSignals(answerText, brand, aliases)
  return {
    brandPresent,
    // v6：只认正文引用（citedUrls）——retrievedUrls 弱一档，独立走 targetDomainRetrieved，
    // 不混进这个判定（五态 grounded 与本字段同一口径，见 engine-capability.ts）。
    targetDomainCited: citesDomain(citedUrls, domain),
    competitorsMentioned: competitorsInText(answerText, competitors),
    citedUrls,
    retrievedUrls,
    targetDomainRetrieved: citesDomain(retrievedUrls, domain),
    // 情感分类只在品牌出现时有意义；未出现一律 'neutral'。按 brand + aliases 同一口径传入
    // （v5：此前只传主品牌词，别名句情感恒判 neutral，见上方版本注释）。
    sentiment: brandPresent ? classifyProbeSentiment(answerText, brand, aliases) : 'neutral',
    hedged,
    unknownAdmission,
  }
}
