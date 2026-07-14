// V0 固定 20 条探针 prompt（§8）：确定性模板按品牌/行业/市场/竞品填充。
// 不用 LLM 生成——同一项目输入必须产出同一 prompt set，才能满足「同协议回测」。
// 模板集版本随 source 字段记录（template_v1），改模板必须升版本号。

import { mentions } from './parse'

export interface PromptSetInput {
  domain: string
  industry: string
  market: string
  language: string
  competitors: string[]
  // D7：品牌别名（project_settings.brand_aliases）。branded 判定与 brand 逐一尝试匹配。可选。
  aliases?: string[]
}

export interface ProbePrompt {
  text: string
  intent: string
  source: 'template_v1' | 'template_v2'
  market: string
  language: string
  priority: number
  // D1：问题文本本身是否含品牌/别名——对生成后的问题文本跑与 parse.ts 同源的 mentions 匹配，
  // 自动覆盖条件分支模板（同一模板有无竞品时可能一个含品牌一个不含）。问题文本/配额/模板版本号不变。
  branded: boolean
}

// D1：branded = mentions(promptText, brand) || 别名逐一匹配任一命中。复用 parse.ts 的 mentions，不复制实现。
function isBranded(text: string, brand: string, aliases: string[]): boolean {
  return mentions(text, brand) || aliases.some((a) => mentions(text, a))
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

// 从项目输入构造模板变量：无竞品时留 null，模板函数各自做品类兜底。
function buildVars(input: PromptSetInput): TemplateVars {
  return {
    brand: brandFromDomain(input.domain),
    category: input.industry.trim() || (input.language === 'zh' ? '该行业' : 'this industry'),
    comp1: input.competitors[0] ?? null,
    comp2: input.competitors[1] ?? null,
  }
}

export function buildPromptSet(input: PromptSetInput): ProbePrompt[] {
  const vars = buildVars(input)
  const zh = input.language === 'zh'
  const aliases = input.aliases ?? []
  return TEMPLATES.map(([intent, zhTpl, enTpl], i) => {
    const text = zh ? zhTpl(vars) : enTpl(vars)
    return {
      text,
      intent,
      source: 'template_v1',
      market: input.market,
      language: input.language,
      priority: i,
      branded: isBranded(text, vars.brand, aliases),
    }
  })
}

// ── prompt 集 v2（分层 30 条）─────────────────────────────────────────────
// 按类别配额：品牌 5 / 品类推荐 8 / 对比 6 / 长尾问答 8 / 信任评估 3 = 30。
// intent 复用现有枚举并新增 'brand'；每个类别对应一个稳定 intent，便于按类别核配额。
// 确定性模板：无竞品用品类兜底，中英双模板按 language 选择。改模板须升 source 版本号。

// 品牌类 5 条（v1 没有的品牌直击问法）。intent = 'brand'。
const V2_BRAND: [string, (v: TemplateVars) => string, (v: TemplateVars) => string][] = [
  ['brand', (v) => `${v.brand} 是什么？它主要解决什么问题？`, (v) => `What is ${v.brand}, and what problem does it mainly solve?`],
  ['brand', (v) => `${v.brand} 靠谱吗？口碑如何？`, (v) => `Is ${v.brand} reliable? What is its reputation like?`],
  ['brand', (v) => `${v.brand} 的主要竞品有哪些？`, (v) => `What are the main competitors of ${v.brand}?`],
  ['brand', (v) => (v.comp1 ? `${v.brand} 和 ${v.comp1} 怎么选？` : `${v.brand} 和同类 ${v.category} 产品怎么选？`), (v) => (v.comp1 ? `How should I choose between ${v.brand} and ${v.comp1}?` : `How should I choose between ${v.brand} and similar ${v.category} products?`)],
  ['brand', (v) => `${v.brand} 适合什么场景？`, (v) => `What use cases is ${v.brand} best suited for?`],
]

// 品类推荐 8 条。intent = 'recommendation'。
const V2_RECOMMENDATION: [string, (v: TemplateVars) => string, (v: TemplateVars) => string][] = [
  ['recommendation', (v) => `${v.category} 领域有哪些值得推荐的产品或服务？`, (v) => `What are the best products or services for ${v.category}?`],
  ['recommendation', (v) => `请推荐几款适合中小团队的 ${v.category} 工具，并说明理由。`, (v) => `Recommend a few ${v.category} tools for small teams and explain why.`],
  ['recommendation', (v) => `目前 ${v.category} 方向最好的解决方案是什么？`, (v) => `What is currently the best solution for ${v.category}?`],
  ['recommendation', (v) => `预算有限的团队应该选择哪家 ${v.category} 产品？`, (v) => `Which ${v.category} product should a team on a tight budget choose?`],
  ['recommendation', (v) => `有哪些开源或更便宜的 ${v.category} 替代方案？`, (v) => `Are there open-source or cheaper alternatives for ${v.category}?`],
  ['recommendation', (v) => `远程 / 跨地区团队用什么 ${v.category} 工具比较合适？`, (v) => `What ${v.category} tools work well for remote or distributed teams?`],
  ['recommendation', (v) => `初创公司在 ${v.category} 上应该怎么选型？`, (v) => `How should a startup pick its ${v.category} stack?`],
  ['recommendation', (v) => `企业级团队在 ${v.category} 方向上应该重点考虑哪些产品？`, (v) => `Which ${v.category} products should an enterprise team focus on?`],
]

// 对比 6 条。intent = 'comparison'。无竞品用品类兜底。
const V2_COMPARISON: [string, (v: TemplateVars) => string, (v: TemplateVars) => string][] = [
  ['comparison', (v) => (v.comp1 ? `${v.brand} 和 ${v.comp1} 相比怎么样？各有什么优缺点？` : `${v.category} 领域的头部产品之间有什么差异？该怎么选？`), (v) => (v.comp1 ? `How does ${v.brand} compare to ${v.comp1}? What are the pros and cons of each?` : `How do the leading ${v.category} products differ, and how should I choose?`)],
  ['comparison', (v) => (v.comp1 && v.comp2 ? `${v.comp1} 和 ${v.comp2} 哪个更好用？有没有其他值得考虑的选择？` : `挑选 ${v.category} 产品时，主流选项之间怎么对比？`), (v) => (v.comp1 && v.comp2 ? `Which is better, ${v.comp1} or ${v.comp2}? Are there other options worth considering?` : `When picking a ${v.category} product, how do the mainstream options compare?`)],
  ['comparison', (v) => `${v.brand} 有哪些替代品？各自适合谁？`, (v) => `What are the alternatives to ${v.brand}, and who is each best for?`],
  ['comparison', (v) => `${v.category} 领域头部产品在功能上有哪些关键差异？`, (v) => `What are the key feature differences among the leading ${v.category} products?`],
  ['comparison', (v) => (v.comp1 ? `${v.brand} 相比 ${v.comp1} 的核心优势和短板是什么？` : `${v.brand} 相比同类 ${v.category} 产品的核心优势和短板是什么？`), (v) => (v.comp1 ? `What are ${v.brand}'s core strengths and weaknesses versus ${v.comp1}?` : `What are ${v.brand}'s core strengths and weaknesses versus similar ${v.category} products?`)],
  ['comparison', (v) => `挑选 ${v.category} 产品时，价格与功能之间该如何权衡？`, (v) => `When choosing a ${v.category} product, how should I weigh price against features?`],
]

// 长尾问答 8 条。intent = 'howto'。
const V2_LONGTAIL: [string, (v: TemplateVars) => string, (v: TemplateVars) => string][] = [
  ['howto', (v) => `如何挑选适合自己团队的 ${v.category} 产品？要注意什么？`, (v) => `How do I choose the right ${v.category} product for my team? What should I watch out for?`],
  ['howto', (v) => `${v.category} 工具怎么落地实施？有什么最佳实践？`, (v) => `How do I roll out a ${v.category} tool? Any best practices?`],
  ['howto', (v) => `${v.category} 产品一般怎么收费？主流产品价格差异大吗？`, (v) => `How are ${v.category} products typically priced? Do the mainstream ones differ much?`],
  ['howto', (v) => `使用 ${v.category} 工具时常见的坑有哪些？如何避免？`, (v) => `What are common pitfalls when using ${v.category} tools, and how do I avoid them?`],
  ['howto', (v) => `${v.category} 产品如何和现有工作流集成？`, (v) => `How do ${v.category} products integrate with an existing workflow?`],
  ['howto', (v) => `迁移到新的 ${v.category} 工具需要注意什么？`, (v) => `What should I consider when migrating to a new ${v.category} tool?`],
  ['howto', (v) => `评估 ${v.category} 产品时应该关注哪些关键指标？`, (v) => `Which key metrics matter when evaluating a ${v.category} product?`],
  ['howto', (v) => `小团队用 ${v.category} 工具如何控制成本？`, (v) => `How can a small team keep ${v.category} tooling costs under control?`],
]

// 信任评估 3 条。intent = 'trust'。
const V2_TRUST: [string, (v: TemplateVars) => string, (v: TemplateVars) => string][] = [
  ['trust', (v) => `${v.category} 领域哪家产品的口碑最好？`, (v) => `Which ${v.category} product has the best reputation?`],
  ['trust', (v) => `有哪些被专家或社区广泛推荐的 ${v.category} 产品？`, (v) => `Which ${v.category} products are widely recommended by experts or the community?`],
  ['trust', (v) => `${v.category} 产品在数据安全与合规方面表现如何？`, (v) => `How do ${v.category} products perform on data security and compliance?`],
]

// 分层顺序拼接：品牌 → 品类推荐 → 对比 → 长尾问答 → 信任评估。
// priority 按拼接后的下标赋值，保证同输入 → 同顺序（同协议回测前提）。
const TEMPLATES_V2 = [
  ...V2_BRAND,
  ...V2_RECOMMENDATION,
  ...V2_COMPARISON,
  ...V2_LONGTAIL,
  ...V2_TRUST,
]

export function buildPromptSetV2(input: PromptSetInput): ProbePrompt[] {
  const vars = buildVars(input)
  const zh = input.language === 'zh'
  const aliases = input.aliases ?? []
  return TEMPLATES_V2.map(([intent, zhTpl, enTpl], i) => {
    const text = zh ? zhTpl(vars) : enTpl(vars)
    return {
      text,
      intent,
      source: 'template_v2',
      market: input.market,
      language: input.language,
      priority: i,
      branded: isBranded(text, vars.brand, aliases),
    }
  })
}
