// V0 固定 20 条探针 prompt（§8）：确定性模板按品牌/行业/市场/竞品填充。
// 不用 LLM 生成——同一项目输入必须产出同一 prompt set，才能满足「同协议回测」。
// 模板集版本随 source 字段记录（template_v1），改模板必须升版本号。

export interface PromptSetInput {
  domain: string
  industry: string
  market: string
  language: string
  competitors: string[]
}

export interface ProbePrompt {
  text: string
  intent: string
  source: 'template_v1'
  market: string
  language: string
  priority: number
}

// 从 URL / 裸域名取品牌词：去 www 与 TLD 后缀，取主域名段。
// docs.example.co.uk → example（多级后缀取倒数第三段的启发式对 V0 够用）。
export function brandFromDomain(domain: string): string {
  const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
  let host: string
  try {
    host = new URL(withScheme).hostname
  } catch {
    host = domain
  }
  const parts = host.replace(/^www\./, '').split('.')
  if (parts.length <= 2) return parts[0]
  // 常见二级公共后缀（co.uk / com.cn …）：末两段都 ≤3 字符时视作后缀
  const [sld, tld] = parts.slice(-2)
  const suffixLen = sld.length <= 3 && tld.length <= 3 ? 2 : 1
  return parts[parts.length - 1 - suffixLen] ?? parts[0]
}

interface TemplateVars {
  brand: string
  category: string
  comp1: string | null
  comp2: string | null
}

// (intent, 中文模板, 英文模板)。模板函数接收变量，无竞品时用品类兜底。
const TEMPLATES: [string, (v: TemplateVars) => string, (v: TemplateVars) => string][] = [
  ['recommendation', (v) => `${v.category} 领域有哪些值得推荐的产品或服务？`, (v) => `What are the best products or services for ${v.category}?`],
  ['recommendation', (v) => `请推荐几款适合中小团队的 ${v.category} 工具，并说明理由。`, (v) => `Recommend a few ${v.category} tools for small teams and explain why.`],
  ['recommendation', (v) => `目前 ${v.category} 方向最好的解决方案是什么？`, (v) => `What is currently the best solution for ${v.category}?`],
  ['recommendation', (v) => `预算有限的团队应该选择哪家 ${v.category} 产品？`, (v) => `Which ${v.category} product should a team on a tight budget choose?`],
  ['comparison', (v) => (v.comp1 ? `${v.brand} 和 ${v.comp1} 相比怎么样？各有什么优缺点？` : `${v.category} 领域的头部产品之间有什么差异？该怎么选？`), (v) => (v.comp1 ? `How does ${v.brand} compare to ${v.comp1}? What are the pros and cons of each?` : `How do the leading ${v.category} products differ, and how should I choose?`)],
  ['comparison', (v) => (v.comp1 && v.comp2 ? `${v.comp1} 和 ${v.comp2} 哪个更好用？有没有其他值得考虑的选择？` : `挑选 ${v.category} 产品时，主流选项之间怎么对比？`), (v) => (v.comp1 && v.comp2 ? `Which is better, ${v.comp1} or ${v.comp2}? Are there other options worth considering?` : `When picking a ${v.category} product, how do the mainstream options compare?`)],
  ['alternatives', (v) => `${v.brand} 有哪些替代品？`, (v) => `What are the best alternatives to ${v.brand}?`],
  ['alternatives', (v) => `有哪些开源或更便宜的 ${v.category} 替代方案？`, (v) => `Are there open-source or cheaper alternatives for ${v.category}?`],
  ['evaluation', (v) => `${v.brand} 靠谱吗？用户评价怎么样？`, (v) => `Is ${v.brand} reliable? What do users say about it?`],
  ['evaluation', (v) => `${v.brand} 值得付费使用吗？`, (v) => `Is ${v.brand} worth paying for?`],
  ['howto', (v) => `如何挑选适合自己团队的 ${v.category} 产品？要注意什么？`, (v) => `How do I choose the right ${v.category} product for my team? What should I watch out for?`],
  ['howto', (v) => `${v.category} 工具怎么落地实施？有什么最佳实践？`, (v) => `How do I roll out a ${v.category} tool? Any best practices?`],
  ['pricing', (v) => `${v.category} 产品一般怎么收费？主流产品价格差异大吗？`, (v) => `How are ${v.category} products typically priced? Do the mainstream ones differ much?`],
  ['pricing', (v) => `${v.brand} 的收费方式是什么？有免费版吗？`, (v) => `How does ${v.brand} charge? Is there a free tier?`],
  ['scenario', (v) => `远程 / 跨地区团队用什么 ${v.category} 工具比较合适？`, (v) => `What ${v.category} tools work well for remote or distributed teams?`],
  ['scenario', (v) => `初创公司在 ${v.category} 上应该怎么选型？`, (v) => `How should a startup pick its ${v.category} stack?`],
  ['brand', (v) => `${v.brand} 是做什么的？主要功能有哪些？`, (v) => `What does ${v.brand} do? What are its main features?`],
  ['brand', (v) => `${v.brand} 和同类产品相比的核心优势是什么？`, (v) => `What are ${v.brand}'s core advantages over similar products?`],
  ['trust', (v) => `${v.category} 领域哪家产品的口碑最好？`, (v) => `Which ${v.category} product has the best reputation?`],
  ['trust', (v) => `有哪些被专家或社区广泛推荐的 ${v.category} 产品？`, (v) => `Which ${v.category} products are widely recommended by experts or the community?`],
]

export function buildPromptSet(input: PromptSetInput): ProbePrompt[] {
  const vars: TemplateVars = {
    brand: brandFromDomain(input.domain),
    category: input.industry.trim() || (input.language === 'zh' ? '该行业' : 'this industry'),
    comp1: input.competitors[0] ?? null,
    comp2: input.competitors[1] ?? null,
  }
  const zh = input.language === 'zh'
  return TEMPLATES.map(([intent, zhTpl, enTpl], i) => ({
    text: zh ? zhTpl(vars) : enTpl(vars),
    intent,
    source: 'template_v1',
    market: input.market,
    language: input.language,
    priority: i,
  }))
}
