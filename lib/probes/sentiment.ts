// G09 引用情感分类器：确定性启发式，纯字符串匹配，LLM 不参与、绝不造数字。
// 只看「含品牌的句子」，在其中做词命中；优先级 比较 > 负面 > 正面 > 中性。
// 判定规则（含下方词表）随 PROBE_PARSER_VERSION 固化——改词表/规则必须升版本号。

export type ProbeSentiment = 'positive' | 'neutral' | 'negative' | 'comparison'

// 比较词：出现即判 'comparison'（对比语境优先级最高，即便同句夹带褒贬）。
// 启发式词表，随 parser_version 固化。
const COMPARISON_TERMS: readonly string[] = [
  // 拉丁（按词边界匹配）
  'vs',
  'versus',
  'compared to',
  'compared with',
  'comparison',
  'alternative',
  'alternatives',
  'better than',
  'worse than',
  'instead of',
  'rather than',
  // CJK（按子串匹配）
  '相比',
  '对比',
  '比较',
  '不如',
  '优于',
  '逊于',
  '相较',
  '替代',
  '选择哪个',
  '哪个更好',
]

// 正面词：命中且句内无否定 → 'positive'。启发式词表，随 parser_version 固化。
const POSITIVE_TERMS: readonly string[] = [
  // 拉丁
  'best',
  'recommended',
  'recommend',
  'leading',
  'reliable',
  'excellent',
  'great',
  'popular',
  'powerful',
  'trusted',
  'top',
  'robust',
  'solid',
  // CJK
  '推荐',
  '优秀',
  '领先',
  '可靠',
  '靠谱',
  '出色',
  '强大',
  '好用',
  '首选',
  '值得',
  '口碑好',
]

// 负面词：命中 → 'negative'。启发式词表，随 parser_version 固化。
const NEGATIVE_TERMS: readonly string[] = [
  // 拉丁
  'poor',
  'lacks',
  'lack',
  'avoid',
  'outdated',
  'expensive',
  'unreliable',
  'buggy',
  'limited',
  'slow',
  'disappointing',
  'weak',
  // CJK
  '差',
  '缺乏',
  '不推荐',
  '过时',
  '昂贵',
  '不稳定',
  '不靠谱',
  '糟糕',
  '缓慢',
  '有限',
  '失望',
]

// 否定词：出现在含正面词的句子中时，抵消正面判定（避免 "not recommended" 误判正面）。
// 启发式词表，随 parser_version 固化。
const NEGATION_TERMS: readonly string[] = [
  'not',
  "n't",
  'never',
  'no ',
  'hardly',
  '不',
  '没',
  '无',
  '别',
  '难以',
]

const CJK_RE = /[一-鿿぀-ヿ가-힯]/

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 拉丁词按词边界匹配（避免子串误命中），CJK 按大小写不敏感子串匹配。
// 与 parse.ts 的 mentions 思路一致，此处内联以保持本模块纯函数无外部依赖。
function hitsTerm(text: string, term: string): boolean {
  if (!term) return false
  if (CJK_RE.test(term)) {
    return text.toLowerCase().includes(term.toLowerCase())
  }
  // 仅「纯拉丁字母词」用词边界匹配；含空格/撇号/多词（如 "compared to" / "n't" / "no "）
  // 无法用 \b 精确包裹，退化为大小写不敏感子串匹配。
  if (!/^[a-z]+$/i.test(term)) {
    return text.toLowerCase().includes(term.toLowerCase())
  }
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(text)
}

function hitsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((t) => hitsTerm(text, t))
}

// 句子级切分：按中英句末标点与换行断句；用于「只看含品牌的句子」。
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?。！？；;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// 品牌是否出现在句中：CJK 子串、拉丁词边界（复用 hitsTerm）。
function sentenceMentionsBrand(sentence: string, brand: string): boolean {
  return hitsTerm(sentence, brand)
}

// 确定性引用情感分类：只在「含品牌的句子集合」里做词命中。
// 品牌未出现于文中 → 'neutral'。优先级：comparison > negative > positive > neutral。
export function classifyProbeSentiment(answerText: string, brand: string): ProbeSentiment {
  if (!brand || !answerText) return 'neutral'
  const brandSentences = splitSentences(answerText).filter((s) => sentenceMentionsBrand(s, brand))
  if (brandSentences.length === 0) return 'neutral'

  let sawNegative = false
  let sawPositive = false

  for (const sentence of brandSentences) {
    if (hitsAny(sentence, COMPARISON_TERMS)) {
      return 'comparison' // 比较优先级最高，命中即返回
    }
    if (hitsAny(sentence, NEGATIVE_TERMS)) {
      sawNegative = true
    }
    if (hitsAny(sentence, POSITIVE_TERMS) && !hitsAny(sentence, NEGATION_TERMS)) {
      sawPositive = true
    }
  }

  if (sawNegative) return 'negative'
  if (sawPositive) return 'positive'
  return 'neutral'
}
