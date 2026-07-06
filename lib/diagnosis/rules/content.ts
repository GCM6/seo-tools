import { parseHTML } from 'linkedom'
import type { Rule, RuleContext, RuleHitDraft } from '../types'
import { schemaRuleFor } from '../schema-vocab'
import { pagesWithExtra, C09_ALT_MISSING_RATIO, SCANNABILITY_PARA_WORDS, isLanguagePathTemplate } from './technical'
import { clusterTemplates } from '@/lib/crawl/template-cluster'
import type { SiteAuditPage } from '@/lib/crawl/site-audit'

// P2 内容/SEO 规则组：解析入口页 rawHtml 判定 title/meta/h1/schema。
// —— 阈值均为启发式经验值，随 RULES_VERSION 版本化 ——
const TITLE_MAX_LEN = 60 // SERP 标题截断的字符经验近似
// C04：薄内容阈值——模板代表页正文低于此字符数视为过薄（启发式经验值）。
const THIN_CONTENT_MIN_CHARS = 300
// C04：模板 URL 模式承载商业意图的关键词（命中即视为商业页，薄内容更值得告警）。
const COMMERCIAL_PATH_KEYWORDS = [
  'product', 'products', 'service', 'services', 'shop', 'store', 'pricing', 'price',
  'solution', 'solutions', 'collection', 'collections', 'category', 'categories',
  'catalog', 'buy', 'order', 'item', 'items', 'sku', 'deal', 'deals', 'offer', 'offers',
]
// C07：正文数据点（数字/百分比）少于此数即判为缺统计（启发式）。
const GEO_STATS_MIN = 3
// C08：可独立成答段落的最小字符数与「前段」占比（启发式）。
const ANSWER_MIN_CHARS = 40
const ANSWER_FRONT_FRACTION = 0.3

// —— TA01/TA02 主题权威（结构性建议、恒 inferred/notice；阈值启发式，无行业标准）——
// 「群内内链密度」以站内全站入度均值近似，非严格群内邻接（见切片设计 §2）。
const TA01_SHALLOW_MAX_PAGES = 2 // 话题群页数 ≤ 此值视为「有话题无深度」
const TA01_ISOLATED_AVG_INBOUND = 1 // 群内页站内入度均值 < 此值视为孤立

// FAQ/HowTo 富摘要已弃用（2026-05 起谷歌全面停展），永不作为富摘要机会推荐新增。
const DEPRECATED_SCHEMA = ['FAQPage', 'FAQ', 'HowTo']
// 2026 年仍产出富摘要 / 利于机器理解的推荐类型。
const RECOMMENDED_SCHEMA = ['Organization', 'Product', 'Article', 'BreadcrumbList', 'Breadcrumb']

interface ParsedEntry {
  title: string | null
  h1Count: number
  h1Texts: string[]
  metaDescription: string | null
}

function parseEntry(html: string): ParsedEntry {
  const { document } = parseHTML(html)
  const title = document.querySelector('title')?.textContent?.trim() || null
  const h1Els = [...document.querySelectorAll('h1')]
  const h1Texts = h1Els.map((h) => h.textContent?.trim() ?? '')
  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || null
  return { title, h1Count: h1Els.length, h1Texts, metaDescription }
}

const entryScope = (ctx: RuleContext): string => ctx.entryPage?.canonicalUrl ?? 'entry'

// C01：入口页标题缺失 / 超长。
const C01: Rule = {
  id: 'C01',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    if (!ctx.entryPage) return null
    const { title } = parseEntry(ctx.entryPage.rawHtml)
    const scope = entryScope(ctx)
    if (!title) {
      return {
        title: '入口页缺少 <title>',
        description: '入口页未检测到有效 <title>，标题是搜索结果最重要的相关性与点击信号。',
        evidenceRefs: [ctx.entryPage.id],
        scope,
        detail: { title: null },
      }
    }
    if (title.length > TITLE_MAX_LEN) {
      return {
        title: '入口页标题过长',
        description: `入口页标题 ${title.length} 字符，超过 ${TITLE_MAX_LEN} 字符，SERP 中易被截断。`,
        evidenceRefs: [ctx.entryPage.id],
        scope,
        detail: { title, length: title.length, max: TITLE_MAX_LEN },
      }
    }
    return null
  },
}

// C02：入口页缺少 meta description。
const C02: Rule = {
  id: 'C02',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    if (!ctx.entryPage) return null
    const { metaDescription } = parseEntry(ctx.entryPage.rawHtml)
    if (metaDescription) return null
    return {
      title: '入口页缺少 meta description',
      description: '入口页未检测到 meta description，搜索引擎将自动摘取正文片段，摘要不可控且影响点击率。',
      evidenceRefs: [ctx.entryPage.id],
      scope: entryScope(ctx),
      detail: {},
    }
  },
}

// C03：入口页 H1 缺失 / 多个 / 与 title 完全重复。
const C03: Rule = {
  id: 'C03',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    if (!ctx.entryPage) return null
    const { title, h1Count, h1Texts } = parseEntry(ctx.entryPage.rawHtml)
    const scope = entryScope(ctx)
    const ev = [ctx.entryPage.id]
    if (h1Count === 0) {
      return {
        title: '入口页缺少 H1',
        description: '入口页未检测到 H1 主标题，页面主题层级不清晰。',
        evidenceRefs: ev,
        scope,
        detail: { h1Count },
      }
    }
    if (h1Count > 1) {
      return {
        title: '入口页存在多个 H1',
        description: `入口页检测到 ${h1Count} 个 H1，主题焦点分散，建议保留单一 H1。`,
        evidenceRefs: ev,
        scope,
        detail: { h1Count, h1Texts },
      }
    }
    if (title && h1Texts[0] && h1Texts[0] === title) {
      return {
        title: '入口页 H1 与 title 完全重复',
        description: 'H1 与 title 文案完全一致，未能覆盖更多相关语义，建议差异化表达。',
        evidenceRefs: ev,
        scope,
        detail: { title, h1: h1Texts[0] },
      }
    }
    return null
  },
}

// C05a：JSON-LD 存在性与类型选择。
// 冲突处理（spec §4.2）：FAQ/HowTo 无富摘要收益，绝不为富摘要目的推荐新增。
const C05a: Rule = {
  id: 'C05a',
  pillar: 'P2',
  side: 'seo',
  severity: 'notice',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft[] | null {
    const schemas = ctx.schemas
    if (schemas.length === 0) return null // 无 schema 证据 artifact，无从引用，交由采集层补
    const hits: RuleHitDraft[] = []

    const deprecatedSchemas = schemas.filter((s) => s.types.some((t) => DEPRECATED_SCHEMA.includes(t)))
    if (deprecatedSchemas.length > 0) {
      const foundTypes = [
        ...new Set(deprecatedSchemas.flatMap((s) => s.types.filter((t) => DEPRECATED_SCHEMA.includes(t)))),
      ]
      hits.push({
        title: '使用已弃用的富摘要 Schema 类型（FAQ/HowTo）',
        description:
          '检测到 FAQ/HowTo 结构化数据：无富摘要收益，2026-05 起谷歌全面停展。标记本身无害可保留，但不应为富摘要目的新增。',
        evidenceRefs: deprecatedSchemas.map((s) => s.id),
        scope: 'schema:deprecated',
        detail: { foundTypes },
      })
    }

    const presentTypes = new Set(schemas.flatMap((s) => s.types))
    const hasRecommended = RECOMMENDED_SCHEMA.some((t) => presentTypes.has(t))
    if (!hasRecommended) {
      hits.push({
        title: '缺少推荐的结构化数据类型',
        description:
          '未检测到 Organization/Product/Article/Breadcrumb 等 2026 年仍产出富摘要或利于机器理解的结构化数据类型，建议按页面类型补充。',
        evidenceRefs: [schemas[0].id],
        scope: 'schema:missing-recommended',
        detail: { presentTypes: [...presentTypes] },
      })
    }

    return hits.length ? hits : null
  },
}

// —— 通用小工具 ——
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

// 稳健正文文本：优先 <body>，为空时回退到 documentElement（linkedom 对无 body 的片段把内容挂在根上）。
function bodyText(document: { body: { textContent: string | null } | null; documentElement: { textContent: string | null } | null }): string {
  const bt = document.body?.textContent ?? ''
  return bt.trim() ? bt : document.documentElement?.textContent ?? ''
}

function hostOf(u: string): string | null {
  try {
    return new URL(u).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

const isCommercialPattern = (pattern: string): boolean => {
  const p = pattern.toLowerCase()
  return COMMERCIAL_PATH_KEYWORDS.some((k) => p.includes('/' + k))
}

// @type 归一为字符串数组（可能是 string | string[] | 缺失）。
function typeList(node: Record<string, unknown>): string[] {
  const t = node['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// 从一条 schema 的 raw[] 展平出「实体根对象」：数组逐项、含 @graph 的取 @graph 子项。
function entityRoots(raw: unknown[]): Record<string, unknown>[] {
  const roots: Record<string, unknown>[] = []
  for (const el of raw) {
    const items = Array.isArray(el) ? el : [el]
    for (const obj of items) {
      if (!isObj(obj)) continue
      const graph = obj['@graph']
      if (Array.isArray(graph)) roots.push(...graph.filter(isObj))
      else roots.push(obj)
    }
  }
  return roots
}

// @context 是否指向 schema.org（缺失或非 schema.org 视为无效）。
function contextIsSchemaOrg(root: Record<string, unknown>): boolean {
  const ctx = root['@context']
  if (ctx == null) return false
  try {
    return JSON.stringify(ctx).toLowerCase().includes('schema.org')
  } catch {
    return false
  }
}

// C04：薄内容（模板代表页正文过薄且模板承载商业意图）。
const C04: Rule = {
  id: 'C04',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft[] | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const byUrl = new Map(audit.payload.pages.map((p) => [p.url, p]))
    const hits: RuleHitDraft[] = []
    for (const tpl of audit.payload.templates) {
      if (!isCommercialPattern(tpl.pattern)) continue
      // 代表页即该模板正文中位页（selectRepresentative 取中位），以其字符数近似模板正文深度。
      const rep = tpl.representativeUrl ? byUrl.get(tpl.representativeUrl) : undefined
      const chars = rep?.mainTextChars
      if (chars == null || chars >= THIN_CONTENT_MIN_CHARS) continue
      hits.push({
        title: '商业模板正文过薄',
        description: `商业意图模板 ${tpl.pattern} 代表页正文仅 ${chars} 字符（阈值 ${THIN_CONTENT_MIN_CHARS}），难以覆盖搜索意图、难获排名。`,
        evidenceRefs: [audit.id],
        scope: tpl.pattern,
        detail: {
          pattern: tpl.pattern,
          representativeUrl: tpl.representativeUrl,
          mainTextChars: chars,
          threshold: THIN_CONTENT_MIN_CHARS,
          pageCount: tpl.pageCount,
        },
      })
    }
    return hits.length ? hits : null
  },
}

// C05b：JSON-LD 语法 / @context 词汇校验（块解析失败或根对象 @context 非 schema.org）。
const C05b: Rule = {
  id: 'C05b',
  pillar: 'P2',
  side: 'seo',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const offending: string[] = []
    let syntaxErrors = 0
    let contextErrors = 0
    for (const sc of ctx.schemas) {
      let bad = false
      for (const blk of sc.blocks) {
        if (blk.ok === false) {
          bad = true
          syntaxErrors++
        }
      }
      for (const root of entityRoots(sc.raw)) {
        if (!contextIsSchemaOrg(root)) {
          bad = true
          contextErrors++
        }
      }
      if (bad) offending.push(sc.id)
    }
    if (offending.length === 0) return null
    return {
      title: 'JSON-LD 语法 / @context 无效',
      description: `检测到结构化数据块 JSON 解析失败或 @context 未指向 schema.org（语法错误 ${syntaxErrors} 处、@context 错误 ${contextErrors} 处），该结构化数据整体失效。`,
      evidenceRefs: offending,
      scope: 'schema:syntax',
      detail: { syntaxErrors, contextErrors, offendingSchemaCount: offending.length },
    }
  },
}

// C05c：Google 富摘要必填字段缺失（仅校验富摘要词表内类型）。
const C05c: Rule = {
  id: 'C05c',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const offendingIds = new Set<string>()
    const missing: { schemaId: string; type: string; missingFields: string[] }[] = []
    for (const sc of ctx.schemas) {
      for (const root of entityRoots(sc.raw)) {
        for (const type of typeList(root)) {
          const rule = schemaRuleFor(type)
          if (!rule) continue
          const lack = rule.required.filter((f) => {
            const v = root[f]
            if (v == null) return true
            if (typeof v === 'string') return v.trim() === ''
            if (Array.isArray(v)) return v.length === 0
            return false
          })
          if (lack.length > 0) {
            offendingIds.add(sc.id)
            missing.push({ schemaId: sc.id, type, missingFields: lack })
          }
        }
      }
    }
    if (missing.length === 0) return null
    const typesAffected = [...new Set(missing.map((m) => m.type))]
    return {
      title: 'Google 富摘要必填字段缺失',
      description: `检测到 ${missing.length} 个结构化数据实体缺少 Google 富摘要必填字段（涉及类型：${typesAffected.join('、')}），富摘要无法生成。`,
      evidenceRefs: [...offendingIds],
      scope: 'schema:required',
      detail: { missing, typesAffected, vocabVersion: 'google_rich_results_2026-07' },
    }
  },
}

// C05d：结构化数据与前端渲染后正文不一致（Google 规范违反，有处罚风险）。
// 依赖渲染证据（renderedText）；无 renderChecks 无从校验 → 返回 null。
const C05d: Rule = {
  id: 'C05d',
  pillar: 'P2',
  side: 'seo',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    if (ctx.renderChecks.length === 0) return null
    const offendingIds = new Set<string>()
    const mismatches: { schemaId: string; field: string; value: string }[] = []

    for (const sc of ctx.schemas) {
      // 匹配同页渲染证据；入口页 schema.sitePageId 为 null，与 null-sitePageId 的 renderCheck 对齐。
      const rc = ctx.renderChecks.find((r) => r.sitePageId === sc.sitePageId)
      if (!rc) continue // 无对应渲染证据，无从校验该 schema
      const haystack = norm(rc.renderedText)

      // 收集受检文本值：根实体的 name/headline，以及树内 Question/Answer 的 text、Offer 的 price。
      const values: { field: string; value: string }[] = []
      for (const root of entityRoots(sc.raw)) {
        if (typeof root['name'] === 'string') values.push({ field: 'name', value: root['name'] })
        if (typeof root['headline'] === 'string') values.push({ field: 'headline', value: root['headline'] as string })
        collectNestedTextValues(root, values)
      }

      for (const { field, value } of values) {
        const needle = norm(value)
        if (!needle) continue
        if (!haystack.includes(needle)) {
          offendingIds.add(sc.id)
          mismatches.push({ schemaId: sc.id, field, value })
        }
      }
    }

    if (mismatches.length === 0) return null
    return {
      title: '结构化数据与前端内容不一致',
      description: `检测到 ${mismatches.length} 处 JSON-LD 文本值在渲染后正文中不存在（如名称/问答/价格），违反 Google 结构化数据规范，有处罚风险。`,
      evidenceRefs: [...offendingIds],
      scope: 'schema:mismatch',
      detail: { mismatches: mismatches.slice(0, 20), mismatchCount: mismatches.length },
    }
  },
}

// 递归收集 Question/Answer.text 与 Offer.price（字符串化）。
function collectNestedTextValues(node: unknown, out: { field: string; value: string }[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectNestedTextValues(n, out)
    return
  }
  if (!isObj(node)) return
  const types = typeList(node)
  if ((types.includes('Question') || types.includes('Answer')) && typeof node['text'] === 'string') {
    out.push({ field: 'qa.text', value: node['text'] })
  }
  if (types.includes('Offer') && (typeof node['price'] === 'string' || typeof node['price'] === 'number')) {
    out.push({ field: 'offers.price', value: String(node['price']) })
  }
  for (const key of Object.keys(node)) {
    if (key === '@type') continue
    collectNestedTextValues(node[key], out)
  }
}

// C06：E-E-A-T 代理信号缺失（作者署名 / 可见日期 / 关于·联系页）。
// 注意：这些是可信度的「代理指标」，非 Google 官方排名因子——描述必须明示。
const C06: Rule = {
  id: 'C06',
  pillar: 'P2',
  side: 'seo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    if (!ctx.entryPage) return null
    const { document } = parseHTML(ctx.entryPage.rawHtml)
    const text = norm(bodyText(document))

    const hasAuthor =
      document.querySelector('[rel="author"], .author, .byline, [itemprop="author"], [class*="author"], [class*="byline"]') !== null
    const hasDate =
      document.querySelector('time, [datetime], [itemprop="datePublished"], [itemprop="dateModified"], meta[property="article:published_time"], [class*="date"], [class*="publish"]') !== null
    const links = [...document.querySelectorAll('a[href]')]
    const hasAboutContact = links.some((a) => {
      const s = `${a.getAttribute('href') ?? ''} ${a.textContent ?? ''}`.toLowerCase()
      return /about|contact|关于|联系|关於|聯系|聯絡/.test(s)
    }) || /about|contact|关于|联系/.test(text)

    const missing: string[] = []
    if (!hasAuthor) missing.push('author')
    if (!hasDate) missing.push('date')
    if (!hasAboutContact) missing.push('about_contact')
    if (missing.length === 0) return null

    return {
      title: 'E-E-A-T 代理信号缺失',
      description: `入口页缺少作者署名 / 可见日期 / 关于·联系入口中的：${missing.join('、')}。注意：这些是可信度的代理指标，并非 Google 官方排名因子，仅作为经验层参考。`,
      evidenceRefs: [ctx.entryPage.id],
      scope: entryScope(ctx),
      detail: { missing, hasAuthor, hasDate, hasAboutContact },
    }
  },
}

// C07：GEO 内容特征缺失（统计数据 / 来源引用外链 / 引述）——KDD 2024 三强项启发式。
const C07: Rule = {
  id: 'C07',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    if (!ctx.entryPage) return null
    const { document } = parseHTML(ctx.entryPage.rawHtml)
    document.querySelectorAll('script, style').forEach((el) => el.remove())
    const text = bodyText(document)

    const statsCount = (text.match(/\d+(?:[.,]\d+)?%?/g) ?? []).length
    const domainHost = hostOf(`https://${ctx.project.domain}`) ?? ctx.project.domain
    const externalLinks = [...document.querySelectorAll('a[href]')].filter((a) => {
      const h = hostOf(a.getAttribute('href') ?? '')
      return h !== null && h !== domainHost
    }).length
    const hasBlockquote = document.querySelector('blockquote, q') !== null
    const quoteChars = (text.match(/["“”„‟'‘’]/g) ?? []).length

    const missing: string[] = []
    if (statsCount < GEO_STATS_MIN) missing.push('statistics')
    if (externalLinks === 0) missing.push('citations')
    if (!hasBlockquote && quoteChars < 2) missing.push('quotes')
    if (missing.length === 0) return null

    return {
      title: 'GEO 内容特征缺失（统计/引用/引述）',
      description: `入口页正文缺少利于 AI 引擎提取的特征：${missing.join('、')}（KDD 2024 三强项启发式：统计数据、来源引用、引述）。属机制性推断，非对照实验结论。`,
      evidenceRefs: [ctx.entryPage.id],
      scope: entryScope(ctx),
      detail: { missing, statsCount, externalLinks, hasBlockquote, quoteChars },
    }
  },
}

// C08：答案未前置——正文前 ~30% 无可独立成答段落（启发式，hypothesis）。
const C08: Rule = {
  id: 'C08',
  pillar: 'P2',
  side: 'geo',
  severity: 'notice',
  claimType: 'hypothesis',
  evaluate(ctx): RuleHitDraft | null {
    if (!ctx.entryPage) return null
    const { document } = parseHTML(ctx.entryPage.rawHtml)
    const paras = [...document.querySelectorAll('p')]
      .map((p) => norm(p.textContent ?? ''))
      .filter((t) => t.length > 0)

    const earlyN = paras.length === 0 ? 0 : Math.max(1, Math.ceil(paras.length * ANSWER_FRONT_FRACTION))
    const early = paras.slice(0, earlyN)
    const hasAnswer = early.some(
      (t) => t.length >= ANSWER_MIN_CHARS && !t.endsWith('?') && !t.endsWith('？'),
    )
    if (hasAnswer) return null

    return {
      title: '答案未前置',
      description: '入口页正文前 30% 未检出可独立成答的段落（先直接回答目标问题再展开），AI 与精选摘要更难摘取。此为启发式假设，需人工确认。',
      evidenceRefs: [ctx.entryPage.id],
      scope: entryScope(ctx),
      detail: { paragraphCount: paras.length, earlyChecked: earlyN, answerMinChars: ANSWER_MIN_CHARS },
    }
  },
}

// C10：内容精确重复（contentHash 逐字相同，≥2 页共享同一哈希）。
const C10: Rule = {
  id: 'C10',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const byHash = new Map<string, string[]>()
    for (const p of audit.payload.pages) {
      const h = p.contentHash
      if (!h) continue
      if (!byHash.has(h)) byHash.set(h, [])
      byHash.get(h)!.push(p.url)
    }
    const groups = [...byHash.entries()]
      .filter(([, urls]) => urls.length >= 2)
      .map(([hash, urls]) => ({ hash, urls }))
    if (groups.length === 0) return null

    const dupPageCount = groups.reduce((n, g) => n + g.urls.length, 0)
    return {
      title: '存在内容精确重复页',
      description: `检测到 ${groups.length} 组正文逐字重复的页面（共 ${dupPageCount} 个页面），会分散权重并引发内部竞争。`,
      evidenceRefs: [audit.id],
      scope: 'content:duplicate',
      detail: {
        duplicateGroups: groups.length,
        duplicatePageCount: dupPageCount,
        examples: groups.slice(0, 5).map((g) => ({ hash: g.hash, urls: g.urls.slice(0, 5) })),
      },
    }
  },
}

// —— 轻检扩展字段规则（图片 alt / 结构可扫描性）：证据同为 site_audit，取数逻辑复用 technical ——
// C09：图片 alt 缺失率过高（站级聚合）。
const C09: Rule = {
  id: 'C09',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const withExtra = pagesWithExtra(ctx)
    const totals = withExtra.reduce(
      (acc, p) => ({ imgs: acc.imgs + p.x.imgCount, missing: acc.missing + p.x.imgAltMissing }),
      { imgs: 0, missing: 0 },
    )
    if (totals.imgs === 0) return null
    const ratio = totals.missing / totals.imgs
    if (ratio <= C09_ALT_MISSING_RATIO) return null
    const examples = withExtra.filter((p) => p.x.imgCount > 0 && p.x.imgAltMissing / p.x.imgCount > C09_ALT_MISSING_RATIO)
    return {
      title: '图片 alt 缺失率过高',
      description: `全站图片 alt 缺失率约 ${Math.round(ratio * 100)}%（${totals.missing}/${totals.imgs}）；alt 影响图片搜索与可访问性，也是 AI 理解图片内容的入口。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { ratio: Number(ratio.toFixed(2)), missing: totals.missing, imgs: totals.imgs, examples: examples.map((p) => p.url).slice(0, 10) },
    }
  },
}

// C11：内容结构可扫描性不足（无列表无表格且平均段落过长）——AI 检索取段偏好结构化段落（机制推断，无对照实验）。
const C11: Rule = {
  id: 'C11',
  pillar: 'P2',
  side: 'seo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const poor = pagesWithExtra(ctx).filter(
      (p) => p.x.listCount === 0 && p.x.tableCount === 0 && p.x.avgParagraphLen > SCANNABILITY_PARA_WORDS,
    )
    if (poor.length === 0) return null
    return {
      title: '内容结构可扫描性不足',
      description: `检测到 ${poor.length} 个页面既无列表也无表格且平均段落超过 ${SCANNABILITY_PARA_WORDS} 词；AI 检索「取段」机制偏好可快速提取的结构化段落（机制性推断，无对照实验）。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: poor.length, threshold: SCANNABILITY_PARA_WORDS, examples: poor.map((p) => p.url).slice(0, 10) },
    }
  },
}

// TA01：主题覆盖浅/话题群割裂。用 clusterTemplates 从页面 URL 重建话题群（排除语言路径群），
// 群内内链密度以站内入度均值近似（非严格群内邻接）。恒结构性建议、不作排名断言。
const TA01: Rule = {
  id: 'TA01',
  pillar: 'P2',
  side: 'seo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const auditCtx = ctx.siteAudit
    if (!auditCtx) return null
    const byUrl = new Map(auditCtx.payload.pages.map((p) => [p.url, p]))
    const clusters = clusterTemplates(auditCtx.payload.pages.map((p) => p.url)).filter(
      (c) => !isLanguagePathTemplate(c.pattern),
    )
    if (clusters.length === 0) return null

    const stripSlash = (u: string) => u.replace(/\/$/, '')
    const impressionOf = (url: string) =>
      ctx.queryPageMetrics
        .filter((m) => stripSlash(m.page) === stripSlash(url))
        .reduce((s, m) => s + m.impressions, 0)

    type ClusterRow = { pattern: string; pageCount: number; avgInbound: number; gscImpressions: number }
    const shallow: ClusterRow[] = []
    const isolated: ClusterRow[] = []
    for (const c of clusters) {
      const pages = c.urls.map((u) => byUrl.get(u)).filter((p): p is SiteAuditPage => !!p)
      if (pages.length === 0) continue
      const avgInbound = pages.reduce((s, p) => s + p.inboundLinkCount, 0) / pages.length
      const row: ClusterRow = {
        pattern: c.pattern,
        pageCount: pages.length,
        avgInbound: Number(avgInbound.toFixed(1)),
        gscImpressions: c.urls.reduce((s, u) => s + impressionOf(u), 0),
      }
      if (pages.length <= TA01_SHALLOW_MAX_PAGES) shallow.push(row)
      if (avgInbound < TA01_ISOLATED_AVG_INBOUND) isolated.push(row)
    }
    if (shallow.length === 0 && isolated.length === 0) return null

    const parts: string[] = []
    if (shallow.length) parts.push(`${shallow.length} 个话题群仅 1-2 页（有话题无深度）`)
    if (isolated.length) parts.push(`${isolated.length} 个话题群站内入度均值近乎为 0（话题群孤立）`)
    return {
      title: '主题覆盖浅 / 话题群割裂',
      description: `${parts.join('；')}。（群内内链密度以站内入度均值近似，非严格群内邻接。）主题权威系行业经验框架、非官方排名因子，此处仅作结构性建议。`,
      evidenceRefs: [auditCtx.id],
      scope: 'site',
      detail: { shallowClusters: shallow, isolatedClusters: isolated },
    }
  },
}

export const contentRules: Rule[] = [C01, C02, C03, C05a, C04, C05b, C05c, C05d, C06, C07, C08, C09, C10, C11, TA01]
