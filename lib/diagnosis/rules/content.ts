import { parseHTML } from 'linkedom'
import type { RuleDef, RuleContext, RuleHitDraft } from '../types'
import { SCHEMA_VOCAB_VERSION, buildSchemaIdIndex, hasField, schemaRuleFor } from '../schema-vocab'
import { pagesWithExtra, C09_ALT_MISSING_RATIO, SCANNABILITY_PARA_WORDS, isLanguagePathTemplate } from './technical'
import { clusterTemplates } from '@/lib/crawl/template-cluster'
import type { SiteAuditPage } from '@/lib/crawl/site-audit'
import { articlePagesOf } from './eeat'
import { readLinkGraph } from '@/lib/crawl/link-graph'
import { isUtilityPage } from '@/lib/crawl/link-integrity'

const SUPERSEDE_MIN_ARTICLES = 3 // 文章页达到此数时 C06/C07 让位给文章级规则（spec S4 §5）

// TR06 能否运行：需要链接图且入口有站内出链（与 TR06 自身守卫一致）。
function tr06CanRun(ctx: RuleContext): boolean {
  const graph = readLinkGraph(ctx.siteAudit?.payload)
  return !!graph && (graph.nodeByUrl.get(graph.entryUrl)?.outInternal ?? 0) > 0
}

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
const TA02_HUB_CLUSTER_MIN_PAGES = 4 // 话题群 ≥ 此页数才谈得上需要 Hub
const TA02_HUB_MIN_INBOUND = 5 // 群内最高入度 < 此值视为缺 Hub 页
const TA01_ISOLATED_MIN_PAGES = 3 // 1–2 页的群内邻接天然为 0，不足此页数不判孤立

// FAQ/HowTo 富摘要已弃用（2026-05 起谷歌全面停展），永不作为富摘要机会推荐新增。
const DEPRECATED_SCHEMA = ['FAQPage', 'FAQ', 'HowTo']
// 2026 年仍产出富摘要 / 利于机器理解的推荐类型。
// 含常见子类型（BlogPosting/LocalBusiness 等）；嵌套节点（如 WebSite.publisher 里的 Organization）同样算（2026-10-03 troyhunt 误报）。
const RECOMMENDED_SCHEMA = [
  'Organization', 'Corporation', 'LocalBusiness', 'OnlineStore', 'NewsMediaOrganization',
  'Product', 'ProductGroup', 'Article', 'BlogPosting', 'NewsArticle', 'TechArticle', 'BreadcrumbList', 'Breadcrumb',
]

interface ParsedEntry {
  title: string | null
  h1Count: number
  h1Texts: string[]
  metaDescription: string | null
  descTags: number // name=description（大小写不敏感）的 <meta> 标签数
  emptyDescTags: number
}

function parseEntry(html: string): ParsedEntry {
  const { document } = parseHTML(html)
  const title = document.querySelector('title')?.textContent?.trim() || null
  const h1Els = [...document.querySelectorAll('h1')]
  const h1Texts = h1Els.map((h) => h.textContent?.trim() ?? '')
  // 主题重复输出时常见「先空后实」两个标签（2026-10-03 troyhunt）：取首个非空的作为描述。
  const descs = [...document.querySelectorAll('meta[name]')]
    .filter((m) => m.getAttribute('name')?.trim().toLowerCase() === 'description')
    .map((m) => m.getAttribute('content')?.trim() ?? '')
  const metaDescription = descs.find(Boolean) || null
  return { title, h1Count: h1Els.length, h1Texts, metaDescription, descTags: descs.length, emptyDescTags: descs.filter((d) => !d).length }
}

const entryScope = (ctx: RuleContext): string => ctx.entryPage?.canonicalUrl ?? 'entry'

// C01：入口页标题缺失 / 超长。
const C01: RuleDef = {
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
const C02: RuleDef = {
  id: 'C02',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    if (!ctx.entryPage) return null
    const { metaDescription, descTags, emptyDescTags } = parseEntry(ctx.entryPage.rawHtml)
    if (metaDescription && descTags > 1) {
      return {
        title: '入口页存在重复的 meta description 标签',
        description: `入口页有 ${descTags} 个 meta description 标签${emptyDescTags ? `（其中 ${emptyDescTags} 个内容为空）` : ''}，多为模板重复输出；搜索引擎与社交平台取哪一个不确定，建议只保留一个。`,
        evidenceRefs: [ctx.entryPage.id],
        scope: entryScope(ctx),
        severity: 'notice',
        detail: { tags: descTags, empty: emptyDescTags },
      }
    }
    if (metaDescription) return null
    return {
      title: '入口页缺少 meta description',
      description: `${descTags ? '入口页的 meta description 标签存在但内容为空' : '入口页未检测到 meta description'}，搜索引擎将自动摘取正文片段，摘要不可控且影响点击率。`,
      evidenceRefs: [ctx.entryPage.id],
      scope: entryScope(ctx),
      detail: {},
    }
  },
}

// C03：入口页 H1 缺失 / 多个 / 与 title 完全重复。
const C03: RuleDef = {
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
    // H1 与 title 相同不违反任何 Google 规范，只是少覆盖一种说法：降为说明 + 假设（SP-A §5.2）。
    if (title && h1Texts[0] && h1Texts[0] === title) {
      return {
        title: '入口页 H1 与 title 完全相同',
        description: '入口页 H1 与 title 完全相同。可考虑差异化表达以覆盖更多相关说法，这不是错误。',
        evidenceRefs: ev,
        scope,
        severity: 'notice',
        claimType: 'hypothesis',
        detail: { title, h1: h1Texts[0] },
      }
    }
    return null
  },
}

// C05a：JSON-LD 存在性与类型选择。
// 冲突处理（spec §4.2）：FAQ/HowTo 无富摘要收益，绝不为富摘要目的推荐新增。
const C05a: RuleDef = {
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

    const presentTypes = new Set(schemas.flatMap((s) => [...s.types, ...nestedTypes(s.raw)]))
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
// JSON-LD 里任意层级的 @type（含 @graph 与属性值里的嵌套节点）。
function nestedTypes(node: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12 || node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((n) => nestedTypes(n, out, depth + 1))
    return out
  }
  const obj = node as Record<string, unknown>
  const t = obj['@type']
  if (typeof t === 'string') out.push(t)
  else if (Array.isArray(t)) out.push(...t.filter((v): v is string => typeof v === 'string'))
  for (const [k, v] of Object.entries(obj)) if (k !== '@type') nestedTypes(v, out, depth + 1)
  return out
}

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

// 携带 @context 的顶层对象：每块本身，顶层数组展开一层；不展开 @graph——@graph 子节点继承外层块的
// @context（Yoast 等插件的标准输出），逐个子节点查 @context 会误报（spec §5.1）。
function contextCarriers(raw: unknown[]): Record<string, unknown>[] {
  return raw.flatMap((el) => (Array.isArray(el) ? el : [el])).filter(isObj)
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
const C04: RuleDef = {
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

// C05b / C05c 描述与 detail 的列举上限。
const SCHEMA_LIST_MAX = 5 // 描述里最多列出的条目数
const SCHEMA_EXAMPLES_MAX = 20 // detail 列表上限（总数另记）

// C05b：JSON-LD 语法 / @context 词汇校验（块解析失败或根对象 @context 非 schema.org）。
const C05b: RuleDef = {
  id: 'C05b',
  pillar: 'P2',
  side: 'seo',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const offending: string[] = []
    const offendingUrls: string[] = []
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
      for (const carrier of contextCarriers(sc.raw)) {
        if (!contextIsSchemaOrg(carrier)) {
          bad = true
          contextErrors++
        }
      }
      if (bad) {
        offending.push(sc.id)
        offendingUrls.push(sc.source)
      }
    }
    if (offending.length === 0) return null
    // 只有出错的块会被忽略，同页其他有效块照常生效——不说"整体失效"。
    const pages = [...new Set(offendingUrls)]
    const listed = pages.slice(0, SCHEMA_LIST_MAX).join('、') + (pages.length > SCHEMA_LIST_MAX ? ` 等 ${pages.length} 个页面` : '')
    return {
      title: 'JSON-LD 语法 / @context 无效',
      description: `${listed} 的 JSON-LD 块有问题：JSON 解析失败 ${syntaxErrors} 处、@context 缺失或未指向 schema.org ${contextErrors} 处。这些块会被 Google 忽略，其中标注的信息不会生效；同页其他有效块不受影响。`,
      evidenceRefs: offending,
      scope: 'schema:syntax',
      detail: { syntaxErrors, contextErrors, offendingSchemaCount: offending.length, pages: pages.slice(0, SCHEMA_EXAMPLES_MAX) },
    }
  },
}

// C05c：按 Google 结构化数据文档逐实体校验字段（仅词表内类型），拆成两条（spec §5.1）：
//   - 缺 Google 要求的字段（或三选一一项都没有）→ warning「不符合 Google 富媒体结果要求」；
//   - 只缺推荐字段 → notice「缺少 Google 推荐字段」。
// 两条各用独立 scope，描述写明页面 URL、类型、缺失字段。
interface SchemaFieldGap { schemaId: string; url: string; type: string; missing: string[] }

// 三选一组的展示文案：[a,b,c] → "a、b 或 c 至少一项"。
const oneOfLabel = (group: string[]): string =>
  group.length > 1 ? `${group.slice(0, -1).join('、')} 或 ${group[group.length - 1]} 至少一项` : group[0]

function schemaGapDraft(gaps: SchemaFieldGap[], kind: 'required' | 'recommended'): RuleHitDraft {
  const listed = gaps.slice(0, SCHEMA_LIST_MAX).map((g) => `${g.url}（${g.type}）：缺 ${g.missing.join('，')}`).join('；')
  const more = gaps.length > SCHEMA_LIST_MAX ? `；等 ${gaps.length} 处` : ''
  const required = kind === 'required'
  return {
    title: required ? '不符合 Google 富媒体结果要求' : '缺少 Google 推荐字段',
    description: required
      ? `${gaps.length} 个结构化数据实体缺少 Google 要求的字段，不具备对应富媒体结果的资格：${listed}${more}。`
      : `${gaps.length} 个结构化数据实体缺少 Google 推荐字段（补齐可提升富媒体结果的完整度，不是硬性要求；只在页面确有对应可见内容时添加）：${listed}${more}。`,
    evidenceRefs: [...new Set(gaps.map((g) => g.schemaId))],
    scope: required ? 'schema:required' : 'schema:recommended',
    severity: required ? 'warning' : 'notice',
    detail: {
      examples: gaps.slice(0, SCHEMA_EXAMPLES_MAX).map(({ url, type, missing }) => ({ url, type, missing })),
      total: gaps.length,
      vocabVersion: SCHEMA_VOCAB_VERSION,
    },
  }
}

const C05c: RuleDef = {
  id: 'C05c',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft[] | null {
    const requiredGaps: SchemaFieldGap[] = []
    const recommendedGaps: SchemaFieldGap[] = []
    for (const sc of ctx.schemas) {
      // 同页节点索引：offers / reviewRating 用 {"@id"} 引用同页另一个节点时按被引用节点判断（第二波审查 I6）。
      const refs = buildSchemaIdIndex(sc.raw)
      for (const root of entityRoots(sc.raw)) {
        for (const type of typeList(root)) {
          const rule = schemaRuleFor(type)
          if (!rule) continue
          const missingRequired = [
            ...rule.required.filter((f) => !hasField(root, f, refs)),
            ...(rule.oneOf ?? []).filter((group) => !group.some((f) => hasField(root, f, refs))).map(oneOfLabel),
          ]
          const missingRecommended = rule.recommended.filter((f) => !hasField(root, f, refs))
          // source = 该 schema 证据的来源页 URL（collect-evidence 写入 entryUrl / 深检页 URL）。
          if (missingRequired.length > 0) requiredGaps.push({ schemaId: sc.id, url: sc.source, type, missing: missingRequired })
          if (missingRecommended.length > 0) recommendedGaps.push({ schemaId: sc.id, url: sc.source, type, missing: missingRecommended })
        }
      }
    }
    const drafts: RuleHitDraft[] = []
    if (requiredGaps.length > 0) drafts.push(schemaGapDraft(requiredGaps, 'required'))
    if (recommendedGaps.length > 0) drafts.push(schemaGapDraft(recommendedGaps, 'recommended'))
    return drafts.length ? drafts : null
  },
}

// C05d：结构化数据与前端渲染后正文不一致（Google 规范违反，有处罚风险）。
// 依赖渲染证据（renderedText）；无 renderChecks 无从校验 → 返回 null。
const C05d: RuleDef = {
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
const C06: RuleDef = {
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

    // 作者/日期是文章级信号：入口页有文章信号且判为非文章（工具首页、企业首页）时不要求（2026-10-03 metadocu 噪音）；
    // 历史证据无文章信号时照旧要求。
    const entryArticle = (ctx.siteAudit?.payload.pages ?? []).find((p) => p.discoveredVia === 'entry')?.lightCheckExtra?.article
    const needsByline = entryArticle ? entryArticle.isArticle : true
    let missing: string[] = []
    if (needsByline && !hasAuthor) missing.push('author')
    if (needsByline && !hasDate) missing.push('date')
    if (!hasAboutContact) missing.push('about_contact')
    // 有 ≥3 个文章页时只让出被接管的项（spec S4 §5；第三轮独立审查 P2-12）：作者/日期 → AR01/AR03；
    // 关于/联系 → TR06，但仅当 TR06 能运行（有链接图且入口有站内出链），否则仍由 C06 报，避免无人报。
    const supersededBy: string[] = []
    if (articlePagesOf(ctx.siteAudit?.payload.pages).length >= SUPERSEDE_MIN_ARTICLES) {
      missing = missing.filter((m) => m !== 'author' && m !== 'date')
      supersededBy.push('AR01', 'AR03')
      if (tr06CanRun(ctx)) {
        missing = missing.filter((m) => m !== 'about_contact')
        supersededBy.push('TR06')
      }
    }
    if (missing.length === 0) return null

    return {
      title: 'E-E-A-T 代理信号缺失',
      description: `入口页缺少作者署名 / 可见日期 / 关于·联系入口中的：${missing.join('、')}。注意：这些是可信度的代理指标，并非 Google 官方排名因子，仅作为经验层参考。`,
      evidenceRefs: [ctx.entryPage.id],
      scope: entryScope(ctx),
      detail: { missing, hasAuthor, hasDate, hasAboutContact, ...(supersededBy.length ? { supersededBy } : {}) },
    }
  },
}

// C07：GEO 内容特征缺失（统计数据 / 来源引用外链 / 引述）——KDD 2024 三强项启发式。
const C07: RuleDef = {
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

    let missing: string[] = []
    if (statsCount < GEO_STATS_MIN) missing.push('statistics')
    if (externalLinks === 0) missing.push('citations')
    if (!hasBlockquote && quoteChars < 2) missing.push('quotes')
    // 有 ≥3 个文章页时，统计与引用由文章级 AR04/AR05 按正文口径接管；引述没有文章级规则，保留（第三轮独立审查 P2-12）。
    const supersededBy: string[] = []
    if (articlePagesOf(ctx.siteAudit?.payload.pages).length >= SUPERSEDE_MIN_ARTICLES) {
      missing = missing.filter((m) => m !== 'statistics' && m !== 'citations')
      supersededBy.push('AR04', 'AR05')
    }
    if (missing.length === 0) return null

    return {
      title: 'GEO 内容特征缺失（统计/引用/引述）',
      description: `入口页正文缺少利于 AI 引擎提取的特征：${missing.join('、')}（KDD 2024 三强项启发式：统计数据、来源引用、引述）。属机制性推断，非对照实验结论。`,
      evidenceRefs: [ctx.entryPage.id],
      scope: entryScope(ctx),
      detail: { missing, statsCount, externalLinks, hasBlockquote, quoteChars, ...(supersededBy.length ? { supersededBy } : {}) },
    }
  },
}

// C08：答案未前置——正文前 ~30% 无可独立成答段落（启发式，hypothesis）。
const C08: RuleDef = {
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
const C10: RuleDef = {
  id: 'C10',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    // 按可见正文哈希（textHash，不含 script/style 等）判重：整页 HTML 哈希会被 nonce、title 差异打散（SP-A §5.2）。
    // 跳转过去的页不计入（内容属于目标页）；同一最终 URL 只算一页（带跟踪参数 / www 的同一页）。旧证据没有 textHash → 不判。
    const byHash = new Map<string, Set<string>>()
    for (const p of audit.payload.pages) {
      const extra = p.lightCheckExtra
      const h = extra?.textHash
      if (!h || extra?.redirected === true) continue
      if (!byHash.has(h)) byHash.set(h, new Set())
      byHash.get(h)!.add(p.finalUrl ?? p.url)
    }
    const groups = [...byHash.entries()]
      .map(([hash, urls]) => ({ hash, urls: [...urls] }))
      .filter((g) => g.urls.length >= 2)
    if (groups.length === 0) return null

    const dupPageCount = groups.reduce((n, g) => n + g.urls.length, 0)
    return {
      title: '存在内容精确重复页',
      description: `检测到 ${groups.length} 组正文文本完全相同的页面（共 ${dupPageCount} 个页面），会分散权重并引发内部竞争。`,
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
const C09: RuleDef = {
  id: 'C09',
  pillar: 'P2',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const withExtra = pagesWithExtra(ctx)
    // 内容图片口径（不计模板区/装饰小图，2026-10-03 metadocu 噪音）；历史证据无该字段时回退全部图片。
    const imgsOf = (x: (typeof withExtra)[number]['x']) => x.contentImgCount ?? x.imgCount
    const missingOf = (x: (typeof withExtra)[number]['x']) => x.contentImgAltMissing ?? x.imgAltMissing
    const totals = withExtra.reduce(
      (acc, p) => ({ imgs: acc.imgs + imgsOf(p.x), missing: acc.missing + missingOf(p.x) }),
      { imgs: 0, missing: 0 },
    )
    if (totals.imgs === 0) return null
    const ratio = totals.missing / totals.imgs
    if (ratio <= C09_ALT_MISSING_RATIO) return null
    const examples = withExtra.filter((p) => imgsOf(p.x) > 0 && missingOf(p.x) / imgsOf(p.x) > C09_ALT_MISSING_RATIO)
    const contentBasis = withExtra.some((p) => p.x.contentImgCount !== undefined)
    return {
      title: '图片 alt 缺失率过高',
      description: `全站${contentBasis ? '内容' : ''}图片 alt 缺失率约 ${Math.round(ratio * 100)}%（${totals.missing}/${totals.imgs}${contentBasis ? '，不含页眉/页脚/导航里的模板图与装饰小图' : ''}）；alt 影响图片搜索与可访问性，也是 AI 理解图片内容的入口。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { ratio: Number(ratio.toFixed(2)), missing: totals.missing, imgs: totals.imgs, examples: examples.map((p) => p.url).slice(0, 10) },
    }
  },
}

// C11：内容结构可扫描性不足（无列表无表格且平均段落过长）——AI 检索取段偏好结构化段落（机制推断，无对照实验）。
const C11: RuleDef = {
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

// 群内忠实有向邻接（SP-A2 #2）：只统计「群内成员 → 群内成员」的出向内链，避开全站导航/页脚
// 对入度的膨胀。payload 带 internalLinks（新证据）→ 群内入度；全 undefined（历史证据）→ 回退
// 全站 inboundLinkCount（不回归旧行为）。discovered_only 页 internalLinks 为 null，作零出向源、
// 但仍可作他页的群内目标。
function clusterInbound(pages: SiteAuditPage[]): { faithful: boolean; countOf: (p: SiteAuditPage) => number } {
  const strip = (u: string) => u.replace(/\/$/, '')
  const members = new Set(pages.map((p) => strip(p.url)))
  const faithful = pages.some((p) => Array.isArray(p.internalLinks))
  const inbound = new Map<string, number>() // strip(目标 url) -> 群内入度
  for (const src of pages) {
    if (!Array.isArray(src.internalLinks)) continue
    const from = strip(src.url)
    const targets = new Set<string>() // 每源→目标去重：同页多次链接同目标只计 1
    for (const link of src.internalLinks) {
      const t = strip(link)
      if (t !== from && members.has(t)) targets.add(t) // 群内、去自链
    }
    for (const t of targets) inbound.set(t, (inbound.get(t) ?? 0) + 1)
  }
  return { faithful, countOf: (p) => (faithful ? inbound.get(strip(p.url)) ?? 0 : p.inboundLinkCount) }
}

// 话题群只由内容页组成（2026-10-03 真实站点核验：首页、单页、PDF、跳转源、标签/分页页、429 页被当成话题群）：
// 已抓 2xx HTML、非入口、非跳转源、非功能页、非标签/分类/作者/归档列表与分页。
const ARCHIVE_SEGMENT = /^(tag|tags|category|categories|author|authors|archive|archives)$/i
const PAGINATION = /\/page\/\d+(\/|$)|[?&](page|pg|paged)=\d+/i
function topicPages(pages: SiteAuditPage[]): SiteAuditPage[] {
  return pages.filter((p) => {
    if (p.checkStatus !== 'checked' || p.discoveredVia === 'entry') return false
    if (p.httpStatus != null && (p.httpStatus < 200 || p.httpStatus >= 300)) return false
    if ((p.lightCheckExtra?.contentKind ?? 'html') !== 'html') return false
    if (p.finalUrl && p.finalUrl !== p.url) return false
    let path: string
    try {
      path = new URL(p.url).pathname
    } catch {
      return false
    }
    if (path === '/' || isUtilityPage(p.url) || PAGINATION.test(p.url)) return false
    return !path.split('/').some((seg) => ARCHIVE_SEGMENT.test(seg))
  })
}
const isTemplated = (pattern: string) => /\{(slug|id|date|uuid)\}/.test(pattern)

// TA01：主题覆盖浅/话题群割裂。用 clusterTemplates 从页面 URL 重建话题群（排除语言路径群），
// 群内密度用忠实群内有向邻接（历史证据回退站内入度近似）。恒结构性建议、不作排名断言。
const TA01: RuleDef = {
  id: 'TA01',
  pillar: 'P2',
  side: 'seo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const auditCtx = ctx.siteAudit
    if (!auditCtx) return null
    const content = topicPages(auditCtx.payload.pages)
    const byUrl = new Map(content.map((p) => [p.url, p]))
    const clusters = clusterTemplates(content.map((p) => p.url)).filter(
      (c) => !isLanguagePathTemplate(c.pattern),
    )
    if (clusters.length === 0) return null
    // 「只有 1–2 页」须确认不是抽样没抓到：只在抓取穷尽（链接图 exhaustive）时判浅。
    const exhaustive = readLinkGraph(auditCtx.payload)?.exhaustive === true

    const stripSlash = (u: string) => u.replace(/\/$/, '')
    const impressionOf = (url: string) =>
      ctx.queryPageMetrics
        .filter((m) => stripSlash(m.page) === stripSlash(url))
        .reduce((s, m) => s + m.impressions, 0)

    // 邻接口径：payload 带 internalLinks 即忠实群内邻接，否则回退站内入度近似（措辞随之切换）。
    const faithful = auditCtx.payload.pages.some((p) => Array.isArray(p.internalLinks))
    type ClusterRow = { pattern: string; pageCount: number; avgInbound: number; gscImpressions: number }
    const shallow: ClusterRow[] = []
    const isolated: ClusterRow[] = []
    for (const c of clusters) {
      const pages = c.urls.map((u) => byUrl.get(u)).filter((p): p is SiteAuditPage => !!p)
      if (pages.length === 0) continue
      const { countOf } = clusterInbound(pages)
      const avgInbound = pages.reduce((s, p) => s + countOf(p), 0) / pages.length
      const row: ClusterRow = {
        pattern: c.pattern,
        pageCount: pages.length,
        avgInbound: Number(avgInbound.toFixed(1)),
        gscImpressions: c.urls.reduce((s, u) => s + impressionOf(u), 0),
      }
      // 浅：独立话题模板（URL 带占位段）却只 1–2 页；字面单页（/about、/pricing）不是话题群。
      if (exhaustive && isTemplated(c.pattern) && pages.length <= TA01_SHALLOW_MAX_PAGES) shallow.push(row)
      if (pages.length >= TA01_ISOLATED_MIN_PAGES && avgInbound < TA01_ISOLATED_AVG_INBOUND) isolated.push(row)
    }
    if (shallow.length === 0 && isolated.length === 0) return null

    const densityLabel = faithful ? '群内邻接（成员互链）密度' : '站内入度均值'
    const caveat = faithful ? '' : '（群内内链密度以站内入度均值近似，非严格群内邻接。）'
    const parts: string[] = []
    if (shallow.length) parts.push(`${shallow.length} 个话题群仅 1-2 页（有话题无深度）`)
    if (isolated.length) parts.push(`${isolated.length} 个话题群${densityLabel}近乎为 0（话题群孤立）`)
    return {
      title: '主题覆盖浅 / 话题群割裂',
      description: `${parts.join('；')}。${caveat}主题权威系行业经验框架、非官方排名因子，此处仅作结构性建议。`,
      evidenceRefs: [auditCtx.id],
      scope: 'site',
      detail: { shallowClusters: shallow, isolatedClusters: isolated },
    }
  },
}

// 上级栏目页（如 /news 列表之于 /news/{id}/{slug}）被群内成员普遍链接即为 Hub（2026-10-03 jac 新闻群误报）。
// 门槛 min(TA02_HUB_MIN_INBOUND, 群页数)；历史证据（无 internalLinks）回退栏目页全站入度。根路径不算栏目。
function hasSectionHub(members: SiteAuditPage[], all: SiteAuditPage[]): boolean {
  const strip = (u: string) => u.replace(/\/$/, '')
  const pageByUrl = new Map(all.filter((p) => p.checkStatus === 'checked' && p.httpStatus === 200).map((p) => [strip(p.url), p]))
  const need = Math.min(TA02_HUB_MIN_INBOUND, members.length)
  const faithful = members.some((p) => Array.isArray(p.internalLinks))
  const ancestors = new Set<string>()
  for (const m of members) {
    try {
      const u = new URL(m.url)
      const segs = u.pathname.split('/').filter(Boolean)
      for (let k = 1; k < segs.length; k++) ancestors.add(`${u.origin}/${segs.slice(0, k).join('/')}`)
    } catch {
      continue
    }
  }
  for (const a of ancestors) {
    const hub = pageByUrl.get(a)
    if (!hub) continue
    const linked = faithful
      ? members.filter((m) => (m.internalLinks ?? []).some((l) => strip(l) === a)).length
      : hub.inboundLinkCount
    if (linked >= need) return true
  }
  return false
}

// TA02：话题群缺 Hub 页（Pillar-Cluster 结构缺失）。群内最大群内邻接入度 < 阈值即判缺中心页
// （历史证据回退站内入度近似）。「主题权威」系行业经验框架、非官方排名因子，恒结构性建议、不作排名断言。
const TA02: RuleDef = {
  id: 'TA02',
  pillar: 'P2',
  side: 'seo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const auditCtx = ctx.siteAudit
    if (!auditCtx) return null
    const content = topicPages(auditCtx.payload.pages)
    const byUrl = new Map(content.map((p) => [p.url, p]))
    const clusters = clusterTemplates(content.map((p) => p.url)).filter(
      (c) => !isLanguagePathTemplate(c.pattern),
    )
    const noHub: { pattern: string; pageCount: number; maxInbound: number; representativeUrl: string }[] = []
    for (const c of clusters) {
      const pages = c.urls.map((u) => byUrl.get(u)).filter((p): p is SiteAuditPage => !!p)
      if (pages.length < TA02_HUB_CLUSTER_MIN_PAGES) continue
      const { countOf } = clusterInbound(pages)
      const maxInbound = Math.max(...pages.map(countOf))
      if (maxInbound < TA02_HUB_MIN_INBOUND && !hasSectionHub(pages, auditCtx.payload.pages)) {
        noHub.push({ pattern: c.pattern, pageCount: pages.length, maxInbound, representativeUrl: pages[0].url })
      }
    }
    if (noHub.length === 0) return null

    return {
      title: '话题群缺 Hub 页（Pillar-Cluster 结构缺失）',
      description: `${noHub.length} 个话题群（≥${TA02_HUB_CLUSTER_MIN_PAGES} 页）无高入度中心页，缺 Pillar-Cluster 结构。建议建支柱页并从各子页内链指向（结构性建议，非排名断言）。`,
      evidenceRefs: [auditCtx.id],
      scope: 'site',
      detail: { clustersWithoutHub: noHub },
    }
  },
}

export const contentRules: RuleDef[] = [C01, C02, C03, C05a, C04, C05b, C05c, C05d, C06, C07, C08, C09, C10, C11, TA01, TA02]
