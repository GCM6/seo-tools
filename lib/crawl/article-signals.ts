import type { parseHTML } from 'linkedom'
import { normalizeUrl, isSameSite } from './url'
import { isSocialHost, isShareUrl } from './social-links'

// 文章级信号（spec 2026-09-29-s4-article-eeat-evidence-social §3 / §9）：抓取阶段对已解析 document 逐页抽取，
// 写入 lightCheckExtra.article。全部是启发式识别：图片/图表里的数据识别不到，规则只能写「未检测到」并标 inferred。
// 第三轮独立审查后（8 个真实站点文章判定精确率 39%）：文章判定加统一门槛、正文根取文本最多的候选、
// 评论区与页脚剔除、引用排除备案/分享链接、URL 解码不再抛错。

type Doc = ReturnType<typeof parseHTML>['document']
type El = Element

export type ArticleReason = 'schema' | 'og_article' | 'article_tag_with_date' | 'url_pattern'
// 门槛结论：只有 ok 才算文章；其余记录被哪道门槛拦下，便于排查误判。
export type ArticleGate = 'ok' | 'no_evidence' | 'excluded_path' | 'listing' | 'too_short' | 'link_dense'

export interface ArticleSignals {
  isArticle: boolean
  articleReasons: ArticleReason[]
  articleGate?: ArticleGate
  author: string | null
  authorSource: 'schema' | 'meta' | 'rel_author' | 'byline' | null
  authorUrl: string | null
  datePublished: string | null
  dateModified: string | null
  mainWords: number
  stats: { total: number; attributed: number }
  citations: { total: number; authoritative: number }
  quotes: number
  tables: number
  hasReferencesSection: boolean
}

export const ARTICLE_MIN_WORDS = 300
// ≥2 个独立证据族时短文也算文章（短链文、视频周报；真实站点 ma.tt / troyhunt 复测）
export const ARTICLE_MIN_WORDS_STRONG = 80
// 日期型 URL：/2024/07/slug、/2024/07/08/slug（WordPress、Hugo、zhangxinxu）
const DATE_PATH = /\/(?:19|20)\d{2}\/(?:0?[1-9]|1[0-2])(?:\/(?:0?[1-9]|[12]\d|3[01]))?\/[^/]+/
const LISTING_LINK_DENSITY = 0.5 // 正文中链接文字占比达到此值视为列表页
const LISTING_MIN_ARTICLES = 3 // 页面上 ≥3 个 <article> 卡片视为列表页
const ARTICLE_TYPES = new Set(['Article', 'BlogPosting', 'NewsArticle', 'TechArticle', 'Report', 'ScholarlyArticle', 'AnalysisNewsArticle'])
const ARTICLE_PATH = /^(blog|blogs|news|article|articles|post|posts|insights|guides?|resources|stories|p|资讯|新闻|博客|文章)$/i
// 首页、分类、标签、分页、作者、归档、搜索、附件等聚合页不是文章（无论声明了什么 schema）。
const EXCLUDED_SEGMENTS = /^(tag|tags|category|categories|topics?|page|author|authors|archives?|search|attachment|feed|wp-json|label|labels)$/i
const MAX_AUTHOR_CHARS = 80
const MIN_VALID_YEAR = 1995

// 中文按字、拉丁按词。
export function countWords(text: string): number {
  const cjk = text.match(/[㐀-鿿豈-﫿]/g)?.length ?? 0
  const latin = text.replace(/[㐀-鿿豈-﫿]/g, ' ').match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g)?.length ?? 0
  return cjk + latin
}

// 权威来源：政府/教育/科研/国际组织域名 + 少量公认数据与学术源（随 RULES_VERSION 版本化）。
// .ac 只认「ac.国家码」（ac.uk、ac.cn）；单独的 .ac 顶级域（阿森松岛）不算（第三轮审查 P3）。
const AUTHORITATIVE_SUFFIX = /(^|\.)(gov|edu|mil)(\.[a-z]{2})?$|(^|\.)ac\.[a-z]{2}$|\.int$|\.org\.cn$/i
const AUTHORITATIVE_HOSTS = [
  'wikipedia.org', 'who.int', 'worldbank.org', 'oecd.org', 'imf.org', 'un.org', 'statista.com', 'nature.com', 'science.org',
  'sciencedirect.com', 'springer.com', 'arxiv.org', 'ieee.org', 'acm.org', 'pewresearch.org',
]
export function isAuthoritativeHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  if (isBeianHost(h)) return false
  return AUTHORITATIVE_SUFFIX.test(h) || AUTHORITATIVE_HOSTS.some((a) => h === a || h.endsWith(`.${a}`))
}

// ICP/公安备案查询站：几乎所有大陆站页脚都链接，不是内容来源（第三轮审查 P1-7）。
const BEIAN_HOST = /(^|\.)beian\.(miit\.)?gov\.cn$|(^|\.)beian\.mps\.gov\.cn$/i
const isBeianHost = (host: string) => BEIAN_HOST.test(host)

// 可注册域名（近似 eTLD+1，不引入公共后缀表）：常见二级后缀取后三段，否则取后两段；
// 托管平台（github.io、vercel.app…）的每个子域是不同主人，各自独立（第三轮审查 P3）。
const SECOND_LEVEL = /^(com|net|org|gov|edu|ac|co|or|ne|go|mil|nic)\.[a-z]{2}$/i
const MULTI_TENANT = [
  'github.io', 'gitlab.io', 'gitee.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'blogspot.com', 'wordpress.com',
  'substack.com', 'medium.com', 'ghost.io', 'tumblr.com', 'herokuapp.com', 'web.app', 'firebaseapp.com', 'appspot.com',
  'azurewebsites.net', 'cloudfront.net', 'notion.site', 'fly.dev', 'onrender.com', 'glitch.me', 'wixsite.com', 'myshopify.com',
]
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '')
  const tenant = MULTI_TENANT.find((t) => h.endsWith(`.${t}`))
  if (tenant) return h.split('.').slice(-(tenant.split('.').length + 1)).join('.')
  const labels = h.split('.')
  if (labels.length <= 2) return labels.join('.')
  const lastTwo = labels.slice(-2).join('.')
  return SECOND_LEVEL.test(lastTwo) ? labels.slice(-3).join('.') : lastTwo
}

// 数据：货币前缀，或数字 + 百分比/倍数/量级/货币/计量单位。年份（2023年）、日期（2024-03-01）、量词（3 个）不算。
const STAT_PATTERN =
  /[$€£¥￥]\s?\d[\d,.]*(?:\s?(?:million|billion|thousand|k|m|bn|万|亿))?|\d[\d,.]*\s?(?:%|％|percent\b|per cent\b|x\b|×|倍|千万|百万|万|亿|million\b|billion\b|thousand\b|bn\b|美元|人民币|元|usd\b|eur\b|rmb\b|kg\b|吨|公里|km\b)/gi
// 归属语：「据」前不能是「数/证/依/占」等（数据库、证据、依据不是归属，第三轮审查 P3）；英文按词边界（studying 不算）。
const ATTRIBUTION =
  /according to|\bsources?\s*[:：]|\bdata from\b|\bsurvey(?:ed|s)?\b|\bstud(?:y|ies)\b|\breport(?:ed|s)?\b|research (?:shows|found|finds)|statistics (?:from|show)|(?<![数证依占收单票])据[^，。,]{0,24}?(?:统计|报告|调查|研究|数据|显示)|来源\s*[:：]|数据显示|研究表明|调查显示|报告显示|统计显示|引自/i
const SENTENCE_SPLIT = /[。！？!?；;]+|\.(?=\s|$)/

const REFERENCES_HEADING = /^(references|sources|further reading|bibliography|参考资料|参考文献|数据来源|资料来源|引用)/i
// 作者链接路径（WordPress /author/x/、Cloudflare /author/x/、/team/x 等）。
const AUTHOR_PATH = /^\/(author|authors|writers?|people|profiles?|contributors?|team|作者)\/[^/]+\/?$/i
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec'
// 可见日期：前缀后的日期文字（阮一峰「日期： 2026年9月18日」、jac「时间: 2026-09-30 21:36」）。
// 「时间/日期/date」必须带冒号，避免「用时间换空间」这类正文误中。
const DATE_TEXT = new RegExp(
  `(?:(?:日期|时间|发布日期|更新日期|发布时间|更新时间|date)\\s*[:：]|发布于|发表于|更新于|published(?: on)?|posted(?: on)?|updated(?: on)?)\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日|\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|(?:${MONTHS})\\.? \\d{1,2}, \\d{4}|\\d{1,2} (?:${MONTHS}) \\d{4})`,
  'i',
)
// 无 class 的纯文本署名：「文/张三」「作者：李四」「By Jane Doe」（第三轮审查 P1-6），只看单个元素自身文字的开头。
const PLAIN_BYLINE = /^\s*(?:文\s*[\/／]\s*|作者\s*[:：]\s*|撰文\s*[:：]?\s*|[Bb]y\s+)([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,3}|[一-鿿·]{2,6})(?=$|[\s,，|·])/
const BYLINE_TOKENS = new Set(['author', 'byline', 'writer', 'authors'])
const COMMENT_TOKENS = new Set(['comment', 'comments', 'respond', 'reply', 'replies', 'disqus', 'discussion'])
const FOOTER_TOKENS = new Set(['footer', 'foot', 'copyright', 'beian', 'icp', 'bottom'])
// div 写的导航（手机端导航面板、下拉菜单、面包屑）：不在 <nav> 里也不属于正文（2026-10-03 jac.com.cn 冒烟：子品牌外链被当成引用）。
// 不含 header：文章头（article-header）里有标题与署名。
const NAV_TOKENS = new Set(['nav', 'navbar', 'navigation', 'menu', 'menubar', 'breadcrumb', 'breadcrumbs', 'sidebar'])

function textOf(el: El | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function resolve(href: string | null | undefined, base: string): string | null {
  if (!href) return null
  try {
    const u = new URL(href, base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

// 安全解码：畸形百分号编码（GBK 路径 %D6%D0、「50%-off」）不抛错，原样返回（第三轮审查 P0-1）。
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const tokensOf = (el: El) => `${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`.toLowerCase().split(/[\s_-]+/)

// JSON-LD：展开数组与 @graph，返回所有对象节点。
function jsonLdNodes(document: Doc): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      out.push(obj)
      if (obj['@graph']) walk(obj['@graph'])
    }
  }
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(s.textContent ?? ''))
    } catch {
      // 语法错误的块由 C05b 负责，这里忽略
    }
  }
  return out
}

const typesOf = (obj: Record<string, unknown>): string[] => {
  const t = obj['@type']
  return typeof t === 'string' ? [t] : Array.isArray(t) ? t.filter((v): v is string => typeof v === 'string') : []
}

function schemaAuthor(article: Record<string, unknown> | undefined, base: string): { name: string; url: string | null } | null {
  if (!article) return null
  let a = article['author']
  if (Array.isArray(a)) a = a[0]
  if (typeof a === 'string' && a.trim()) return { name: a.trim(), url: null }
  if (a && typeof a === 'object') {
    const o = a as Record<string, unknown>
    const name = typeof o['name'] === 'string' ? o['name'].trim() : ''
    if (name) return { name, url: typeof o['url'] === 'string' ? resolve(o['url'], base) : null }
  }
  return null
}

const cleanAuthor = (s: string) =>
  s.replace(/^(by|written by|posted by|author|作者|文|撰文|编辑)\s*[:：/／]?\s*/i, '').trim().slice(0, MAX_AUTHOR_CHARS)

function bylineElement(root: El): El | null {
  for (const el of root.querySelectorAll('[class], [id], [itemprop]')) {
    if ((el.getAttribute('itemprop') ?? '').toLowerCase() === 'author') return el
    if (tokensOf(el).some((t) => BYLINE_TOKENS.has(t))) return el
  }
  return null
}

function plainTextByline(root: El): string | null {
  for (const el of [...root.querySelectorAll('p, span, div, li, small, address, h4, h5, h6')].slice(0, 60)) {
    if (el.querySelector('p, div, li')) continue // 只看叶子级元素自身文字
    const m = PLAIN_BYLINE.exec(textOf(el))
    if (m) return m[1].slice(0, MAX_AUTHOR_CHARS)
  }
  return null
}

// 正文根：所有 <article>/<main> 候选里文本最多的那个（Ghost 主题首个 <article> 只有标题区，第三轮审查 P0-3）；
// 都没有则用 body 去掉导航/页眉/页脚/侧栏与页脚类 div（备案、版权）。一律克隆，并剔除脚本与评论区。
function contentRoot(document: Doc): El | null {
  const candidates = [...document.querySelectorAll('article, main')]
  const pick = candidates.length
    ? candidates.reduce((best, el) => ((el.textContent ?? '').length > (best.textContent ?? '').length ? el : best))
    : document.querySelector('body')
  if (!pick) return null
  const root = pick.cloneNode(true) as El
  root.querySelectorAll('script, style, noscript, template').forEach((e) => e.remove())
  if (pick.tagName.toUpperCase() === 'BODY') {
    root.querySelectorAll('nav, header, footer, aside').forEach((e) => e.remove())
    const total = (root.textContent ?? '').length
    for (const el of [...root.querySelectorAll('[id], [class]')]) {
      const tokens = tokensOf(el)
      if (tokens.some((t) => FOOTER_TOKENS.has(t))) el.remove()
      // 导航词元的容器若包住了大半正文，是页面级包装（with-sidebar、menu-open 等状态类），不剔除
      else if (tokens.some((t) => NAV_TOKENS.has(t)) && (el.textContent ?? '').length < total * 0.5) el.remove()
    }
  }
  // 评论区里的作者、链接与数字都不属于文章本身（第三轮审查 P1-6：评论作者被当成文章作者）。
  for (const el of [...root.querySelectorAll('[id], [class]')]) if (tokensOf(el).some((t) => COMMENT_TOKENS.has(t))) el.remove()
  return root
}

const BLOCK_SELECTOR = 'p, li, td, th, blockquote, figcaption, dd'

function statsOf(root: El): { total: number; attributed: number } {
  let total = 0
  let attributed = 0
  const blocks = [...root.querySelectorAll(BLOCK_SELECTOR)].filter((b) => !b.querySelector(BLOCK_SELECTOR))
  // div 结构站（无 p/li）退回到叶子 div
  const units = blocks.length ? blocks : [...root.querySelectorAll('div')].filter((d) => !d.querySelector('div'))
  for (const block of units) {
    const sentences = textOf(block).split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean)
    sentences.forEach((sentence, i) => {
      const count = sentence.match(STAT_PATTERN)?.length ?? 0
      if (!count) return
      total += count
      // 归属语在同句或同段前一句（「据某机构统计：……。其中……」）
      if (ATTRIBUTION.test(sentence) || (i > 0 && ATTRIBUTION.test(sentences[i - 1]))) attributed += count
    })
  }
  return { total, attributed }
}

function citationsOf(root: El, pageUrl: string, entryHost: string): { total: number; authoritative: number } {
  const seen = new Set<string>()
  let authoritative = 0
  const siteDomain = registrableDomain(entryHost)
  for (const a of root.querySelectorAll('a[href]')) {
    const raw = a.getAttribute('href') ?? ''
    const n = normalizeUrl(raw, pageUrl)
    if (!n || isSameSite(n, entryHost) || seen.has(n)) continue
    const host = new URL(n).hostname
    // 同一家的子域是自家资料；备案查询站与分享链接不是来源（第三轮审查 P1-7）。
    if (registrableDomain(host) === siteDomain || isBeianHost(host) || isShareUrl(resolve(raw, pageUrl) ?? n)) continue
    // 社媒主页不是来源引用；GitHub 仓库是常见技术引用，不按社媒排除。
    if (isSocialHost(host) && !/(^|\.)github\.com$/i.test(host)) continue
    seen.add(n)
    if (isAuthoritativeHost(host)) authoritative++
  }
  return { total: seen.size, authoritative }
}

function firstMeta(document: Doc, selector: string): string | null {
  const v = document.querySelector(selector)?.getAttribute('content')?.trim()
  return v ? v : null
}

// 有效日期：非空、能取到 1995 年之后的年份（Hugo 零日期 0001-01-01、空 datetime 不算，第三轮审查 P1-6）。
function validDate(v: string | null | undefined): string | null {
  const s = (v ?? '').trim()
  if (!s) return null
  const year = Number(/(\d{4})/.exec(s)?.[1] ?? NaN)
  return year >= MIN_VALID_YEAR && year <= new Date().getFullYear() + 1 ? s : null
}
const firstValidDate = (...candidates: (string | null | undefined)[]) => candidates.map(validDate).find((d) => d !== null) ?? null

function linkDensity(root: El | null): number {
  if (!root) return 0
  const total = textOf(root).length
  if (total === 0) return 0
  const linked = [...root.querySelectorAll('a')].reduce((s, a) => s + textOf(a).length, 0)
  return linked / total
}

function authorPathLink(scope: El, pageUrl: string): { name: string; url: string } | null {
  const siteDomain = registrableDomain(new URL(pageUrl).hostname)
  for (const a of scope.querySelectorAll('a[href]')) {
    const url = resolve(a.getAttribute('href'), pageUrl)
    // 只认本站（同一可注册域名）的作者页：站外 /people/x/（豆瓣主页）不是本站作者（coolshell /haoel 复测）
    if (!url || registrableDomain(new URL(url).hostname) !== siteDomain) continue
    const pathname = safeDecode(new URL(url).pathname)
    const name = cleanAuthor(textOf(a))
    if (AUTHOR_PATH.test(pathname) && name) return { name, url }
  }
  return null
}

function visibleDate(root: El | null): string | null {
  if (!root) return null
  return DATE_TEXT.exec(textOf(root).slice(0, 3000))?.[1] ?? null
}

// 标题附近（正文开头 160 字符内）无前缀的完整日期（overreacted.io「January 18, 2026」形态）：只用于取日期，不作判定证据。
const TITLE_DATE = new RegExp(`(\\d{4}年\\d{1,2}月\\d{1,2}日|\\d{4}-\\d{1,2}-\\d{1,2}|(?:${MONTHS})\\.? \\d{1,2}, \\d{4}|\\d{1,2} (?:${MONTHS}) \\d{4})`, 'i')
function titleDate(root: El | null): string | null {
  if (!root) return null
  return TITLE_DATE.exec(textOf(root).slice(0, 160))?.[1] ?? null
}

function excludedPath(pageUrl: string): boolean {
  try {
    const u = new URL(pageUrl)
    const segs = u.pathname.split('/').filter(Boolean).map(safeDecode)
    if (segs.length === 0) return true // 首页
    if (u.searchParams.has('s') || u.searchParams.has('attachment_id')) return true
    return segs.some((s) => EXCLUDED_SEGMENTS.test(s)) || /^page\/\d+$/i.test(segs.slice(-2).join('/'))
  } catch {
    return false
  }
}

// 列表页：去掉评论类 <article>（WordPress 评论用 <article class="comment-body">，coolshell 复测）后仍有 ≥3 个，
// 且最大的一个不到这些 <article> 文本总量的一半（各卡片大小相近 = 列表）。
function isListing(document: Doc): boolean {
  const cards = [...document.querySelectorAll('article')].filter((a) => {
    for (let el: El | null = a; el; el = el.parentElement) if (tokensOf(el).some((t) => COMMENT_TOKENS.has(t))) return false
    return true
  })
  if (cards.length < LISTING_MIN_ARTICLES) return false
  const sizes = cards.map((c) => (c.textContent ?? '').length)
  const total = sizes.reduce((a, b) => a + b, 0)
  return total > 0 && Math.max(...sizes) / total < 0.5
}

// 文章判定（第三轮独立审查 P0-2 + 9 个真实站点按 URL 真值复测）：证据按族计——声明族（schema / og:article，
// 常由同一 CMS 模板一起输出，不算两条）、结构族（<article> 内有效时间）、URL 族（博客类路径 / 日期路径）。
//   ≥2 族：正文 ≥80；只有声明族：须 schema 与 og 都有、识别到作者，正文 ≥80；只有结构族：须识别到作者，正文 ≥300；
//   只有 URL 族：正文 ≥300（Ghost 静态页只有 schema、营销落地页声明了 BlogPosting 却没有作者——都不算）。
function articleGateOf(input: { document: Doc; pageUrl: string; reasons: ArticleReason[]; mainWords: number; root: El | null; hasAuthor: boolean }): ArticleGate {
  const { document, pageUrl, reasons, mainWords, root, hasAuthor } = input
  if (reasons.length === 0) return 'no_evidence'
  if (excludedPath(pageUrl)) return 'excluded_path'
  if (isListing(document)) return 'listing'
  const declared = reasons.includes('schema') || reasons.includes('og_article')
  const families = (declared ? 1 : 0) + (reasons.includes('article_tag_with_date') ? 1 : 0) + (reasons.includes('url_pattern') ? 1 : 0)
  if (families >= 2) {
    if (mainWords < ARTICLE_MIN_WORDS_STRONG) return 'too_short'
  } else if (declared) {
    // 只有声明族：schema 与 og 都声明且有作者才算，且视为强证据（troyhunt 视频周报 135 词）
    if (!(reasons.includes('schema') && reasons.includes('og_article') && hasAuthor)) return 'no_evidence'
    if (mainWords < ARTICLE_MIN_WORDS_STRONG) return 'too_short'
  } else {
    // 只有结构族（<article>+时间）还须识别到作者：WordPress 独立页、文档页也常这样标记（coolshell /about、plausible /docs）
    if (reasons.includes('article_tag_with_date') && !hasAuthor) return 'no_evidence'
    if (mainWords < ARTICLE_MIN_WORDS) return 'too_short'
  }
  if (linkDensity(root) >= LISTING_LINK_DENSITY) return 'link_dense'
  return 'ok'
}

export function extractArticleSignals(document: Doc, pageUrl: string, entryHost: string): ArticleSignals {
  const nodes = jsonLdNodes(document)
  const articleNode = nodes.find((n) => typesOf(n).some((t) => ARTICLE_TYPES.has(t)))
  const root = contentRoot(document)
  const mainWords = countWords(textOf(root))
  let path = ''
  try {
    path = new URL(pageUrl).pathname
  } catch {
    // ignore
  }

  const reasons: ArticleReason[] = []
  if (articleNode) reasons.push('schema')
  if ((firstMeta(document, 'meta[property="og:type"]') ?? '').toLowerCase() === 'article') reasons.push('og_article')
  if ([...document.querySelectorAll('article time[datetime]')].some((t) => validDate(t.getAttribute('datetime')))) reasons.push('article_tag_with_date')
  // 博客类路径段之后须还有文章 slug：/blog、/news 本身是栏目首页（plausible /blog 复测）
  const segs = path.split('/').filter(Boolean).map(safeDecode)
  if (segs.slice(0, -1).some((seg) => ARTICLE_PATH.test(seg)) || DATE_PATH.test(path)) reasons.push('url_pattern')


  // 作者：schema > meta > rel=author > 署名元素 > 作者路径链接 > 纯文本署名
  let author: string | null = null
  let authorSource: ArticleSignals['authorSource'] = null
  let authorUrl: string | null = null
  const fromSchema = schemaAuthor(articleNode, pageUrl)
  const relAuthor = document.querySelector('a[rel~="author"]')
  const byline = root ? bylineElement(root) : null
  if (fromSchema) {
    author = fromSchema.name.slice(0, MAX_AUTHOR_CHARS)
    authorSource = 'schema'
    authorUrl = fromSchema.url
  } else if (firstMeta(document, 'meta[name="author"]')) {
    author = cleanAuthor(firstMeta(document, 'meta[name="author"]')!)
    authorSource = 'meta'
  } else if (relAuthor && textOf(relAuthor)) {
    author = cleanAuthor(textOf(relAuthor))
    authorSource = 'rel_author'
    authorUrl = resolve(relAuthor.getAttribute('href'), pageUrl)
  } else if (byline && cleanAuthor(textOf(byline))) {
    author = cleanAuthor(textOf(byline))
    authorSource = 'byline'
    authorUrl = resolve(byline.querySelector('a[href]')?.getAttribute('href'), pageUrl)
  } else {
    // /author/<名字>/ 形态的作者链接（Cloudflare 博客：署名元素没有 author 类名）。
    const link = root ? authorPathLink(root, pageUrl) : null
    const plain = root ? plainTextByline(root) : null
    if (link) {
      author = link.name
      authorSource = 'byline'
      authorUrl = link.url
    } else if (plain) {
      author = plain
      authorSource = 'byline'
    }
  }
  if (!authorUrl && relAuthor) authorUrl = resolve(relAuthor.getAttribute('href'), pageUrl)

  const gate = articleGateOf({ document, pageUrl, reasons, mainWords, root, hasAuthor: !!author })

  const schemaStr = (k: string) => (articleNode && typeof articleNode[k] === 'string' ? (articleNode[k] as string) : null)
  const datePublished = firstValidDate(
    schemaStr('datePublished'),
    firstMeta(document, 'meta[property="article:published_time"]'),
    document.querySelector('[itemprop="datePublished"]')?.getAttribute('content'),
    document.querySelector('[itemprop="datePublished"]')?.getAttribute('datetime'),
    ...[...(root?.querySelectorAll('time[datetime]') ?? [])].map((t) => t.getAttribute('datetime')),
    // hAtom 微格式 <abbr class="published" title="ISO">（阮一峰博客形态）
    document.querySelector('.published[title], abbr.published[title]')?.getAttribute('title'),
    visibleDate(root),
    titleDate(root),
  )
  const dateModified = firstValidDate(
    schemaStr('dateModified'),
    firstMeta(document, 'meta[property="article:modified_time"]'),
    document.querySelector('[itemprop="dateModified"]')?.getAttribute('content'),
    document.querySelector('.updated[title], abbr.updated[title]')?.getAttribute('title'),
  )

  return {
    isArticle: gate === 'ok',
    articleReasons: reasons,
    articleGate: gate,
    author,
    authorSource,
    authorUrl,
    datePublished,
    dateModified,
    mainWords,
    stats: root ? statsOf(root) : { total: 0, attributed: 0 },
    citations: root ? citationsOf(root, pageUrl, entryHost) : { total: 0, authoritative: 0 },
    quotes: root ? root.querySelectorAll('blockquote, q').length : 0,
    tables: root ? root.querySelectorAll('table').length : 0,
    hasReferencesSection: root ? [...root.querySelectorAll('h2, h3, h4')].some((h) => REFERENCES_HEADING.test(textOf(h))) : false,
  }
}
