// 种子词收集（Phase C 竞品识别与缺口分析的输入）：GSC Top 展示词 ∪ 探针 prompt 检索式，
// 去品牌导航词、去重、按优先级截断。纯函数、确定性——同输入同输出，保证同协议回测可比。
// spec §4 P4：种子词集 = GSC Top 展示词（≤100）∪ 探针 prompt 对应检索式（去品牌词）。

const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

// 品牌导航词判定：归一后包含品牌串即视为品牌词（竞品识别不用品牌词——SERP 会被本站自身占位，
// 无法暴露真实竞品）。品牌为空则不过滤。
function isBrandQuery(text: string, brand: string): boolean {
  const b = normalize(brand)
  if (!b) return false
  return normalize(text).includes(b)
}

export function gatherSeedKeywords(input: {
  // GSC query 维展示词（keyText + impressions），按展示量排序取头部。
  gscQueries: { keyText: string; impressions: number }[]
  // 探针 prompt 文本（作为品类/长尾检索式种子）。
  promptTexts: string[]
  brand: string
  limit: number
}): string[] {
  const { gscQueries, promptTexts, brand, limit } = input
  const seen = new Set<string>()
  const out: string[] = []

  const push = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    if (isBrandQuery(text, brand)) return // 去品牌导航词
    const key = normalize(text)
    if (seen.has(key)) return
    seen.add(key)
    out.push(text)
  }

  // GSC 展示词优先（真实需求信号，L4），按展示量降序。
  for (const q of [...gscQueries].sort((a, b) => b.impressions - a.impressions)) push(q.keyText)
  // 探针检索式补充品类/长尾覆盖。
  for (const t of promptTexts) push(t)

  return out.slice(0, Math.max(0, limit))
}
