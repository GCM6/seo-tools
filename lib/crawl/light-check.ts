import { parseHTML } from 'linkedom'
import { safeFetch } from '@/lib/security/safe-fetch'
import { extractMainTextChars } from '@/lib/collection/page-parser'
import { sha256Hex } from '@/lib/collection/hash'
import { normalizeUrl, isSameSite } from './url'
import { extractArticleSignals, type ArticleSignals } from './article-signals'

// 轻检扩展信号：单 JSON 列落库，供 T06/T08/T13/T14/C09/C11 规则消费（spec §4.2 通道一）。
export interface LightCheckExtra {
  hasViewport: boolean // <meta name=viewport>（移动优先索引必查）
  hreflangEntries: { hreflang: string; href: string }[] // <link rel=alternate hreflang=..>
  imgCount: number
  imgAltMissing: number // <img> 无非空 alt
  // 内容图片口径（2026-10-03）：不计页眉/页脚/导航里的模板图、role=presentation/none、aria-hidden、宽高都 ≤48px 的小图。
  // 全站每页重复的装饰 logo 不应把 alt 缺失率推到 100%；历史证据无此字段时 C09 回退旧口径。
  contentImgCount?: number
  contentImgAltMissing?: number
  listCount: number // <ul>+<ol>
  tableCount: number // <table>
  avgParagraphLen: number // <p> 的平均词数
  h2QuestionRate: number // <h2> 文本以 ? 结尾或以疑问词开头的比例
  isHttps: boolean // 页面 URL 协议
  mixedContentCount: number // https 页上的 http:// 资源数（只算会加载资源的元素，见 parseExtra）
  // 可见正文哈希（SP-A §5.2 #5）：去掉 script/style/noscript/template/svg 后压缩空白取 sha256；无可见文本为 null。
  // 供 C10 判断"正文完全相同"；contentHash 仍是整页 HTML 语义，其他消费方不受影响。旧证据没有此字段。
  textHash?: string | null
  redirected: boolean // finalUrl !== 请求 url
  linkDetailsTruncated?: boolean // 站内目标超上限被截断（spec S1 §3）；站外截断另记，不影响站内出链完整性
  externalLinksTruncated?: boolean // 站外链接超上限被截断
  // 响应内容类型（S1 修复波）：html 才解析链接；media（图片/视频/PDF 等）无站内出链；other 出链未知。
  // 链接图据此判断「出链是否完整已知」，历史证据无此字段。
  contentKind?: ContentKind
  // 文章级信号（spec S4 §3）：只在 HTML 解析路径产出；历史证据无此字段。抽取器出错时为空，不连累整页。
  article?: ArticleSignals
  // 页眉/页脚/导航里有微信、二维码字样的图片：中文站常只放公众号二维码而不放链接（SO01 据此不误报）。
  socialQrHint?: boolean
  // 邮箱/电话链接（mailto:、tel:、Cloudflare 邮箱混淆链接）按 kind+区域去重；TR06 据此认定提供了联系方式。
  contactLinks?: ContactLink[]
}

export interface ContactLink {
  kind: 'email' | 'phone'
  region: LinkRegion
}

// html：解析链接；document（PDF/Office）：含可点击超链接但本工具不解析 → 出链未知；
// resource（feed/CSS/JS/JSON/纯文本/XML）：机器格式，同 sitemap 一样不属于 HTML 链接图 → 出链为空；
// media（图片/音视频/字体/压缩包）：无链接；other：未知类型 → 出链未知（第二轮独立审查 #2/#13）。
export type ContentKind = 'html' | 'document' | 'resource' | 'media' | 'other'

// 链接所在区域：就近祖先启发式（语义标签 → role → id/class 词元），S3 加权时须标 inferred（spec S1 §3）。
export type LinkRegion = 'nav' | 'header' | 'footer' | 'aside' | 'main' | 'body'
export type LinkRel = 'nofollow' | 'ugc' | 'sponsored'

// 同一源页 → 同一目标聚合为一条。
export interface InternalLinkDetail {
  url: string
  count: number
  anchors: string[] // 去重，最多 3 条，每条 ≤80 字符
  regions: LinkRegion[]
  nofollow: boolean // 仅当每次出现都带 nofollow/ugc/sponsored
  href?: string // 首次出现的原始解析地址（与归一化键不同时才有）：抓取请求它，归一化 url 只作去重键（审查 #6）
}

export interface ExternalLinkDetail {
  url: string
  host: string
  anchor: string
  region: LinkRegion
  rel: LinkRel[]
  href?: string // 同 InternalLinkDetail.href
}

export const MAX_INTERNAL_LINK_TARGETS = 1000
export const MAX_EXTERNAL_LINKS = 200
const MAX_ANCHORS_PER_TARGET = 3
const MAX_ANCHOR_CHARS = 80

export interface LightCheckPage {
  url: string
  finalUrl: string
  httpStatus: number
  title: string | null
  canonicalUrl: string | null
  metaRobots: string | null
  mainTextChars: number
  contentHash: string
  internalLinks: string[] // 恒等于 linkDetails.map(d => d.url)
  linkDetails: InternalLinkDetail[]
  externalLinks: ExternalLinkDetail[]
  extra: LightCheckExtra
  checkStatus: 'checked' | 'error'
  errorReason: string | null
}

// h2 以疑问词开头的判定词表（英文 + 中文常见）。
const QUESTION_WORDS = [
  'what', 'why', 'how', 'when', 'where', 'who', 'which', 'whose', 'whom',
  'is', 'are', 'can', 'does', 'do', 'should', 'will', 'would', 'could',
  '什么', '为什么', '如何', '怎么', '怎样', '是否', '哪', '为何', '多少',
]

function isQuestionHeading(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false
  if (t.endsWith('?') || t.endsWith('？')) return true
  return QUESTION_WORDS.some((w) => t.startsWith(w))
}

const wordCount = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0)

// 空扩展信号：解析失败 / 非 HTML / 请求错误时的占位。
export function emptyLightCheckExtra(isHttps = false, redirected = false): LightCheckExtra {
  return {
    hasViewport: false,
    hreflangEntries: [],
    imgCount: 0,
    imgAltMissing: 0,
    listCount: 0,
    tableCount: 0,
    avgParagraphLen: 0,
    h2QuestionRate: 0,
    isHttps,
    mixedContentCount: 0,
    redirected,
    linkDetailsTruncated: false,
  }
}

const REGION_BY_TAG: Record<string, LinkRegion> = { NAV: 'nav', HEADER: 'header', FOOTER: 'footer', ASIDE: 'aside', MAIN: 'main', ARTICLE: 'main' }
const REGION_BY_ROLE: Record<string, LinkRegion> = { navigation: 'nav', banner: 'header', contentinfo: 'footer', complementary: 'aside', main: 'main' }
const REGION_BY_TOKEN: Record<string, LinkRegion> = { nav: 'nav', navbar: 'nav', navigation: 'nav', menu: 'nav', header: 'header', masthead: 'header', footer: 'footer', sidebar: 'aside' }
const REL_VALUES: LinkRel[] = ['nofollow', 'ugc', 'sponsored']
// header/footer 位于这些元素内时只是局部页眉/页脚（如文章头），不算全站区域（参照 HTML-AAM）。
// 刻意不含 MAIN：大量站点用 <main> 包住整页含页眉页脚（真实站点 metadocu.com），计入会把全站页脚判成正文。
const SCOPING_TAGS = new Set(['ARTICLE', 'ASIDE', 'NAV', 'SECTION'])

function isScoped(el: Element): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) if (SCOPING_TAGS.has(p.tagName.toUpperCase())) return true
  return false
}

function regionOfElement(el: Element): LinkRegion | null {
  const byTag = REGION_BY_TAG[el.tagName.toUpperCase()]
  if (byTag) return (byTag === 'header' || byTag === 'footer') && isScoped(el) ? null : byTag
  const byRole = REGION_BY_ROLE[(el.getAttribute('role') ?? '').trim().toLowerCase()]
  if (byRole) return byRole // 显式 role 以作者声明为准，不做作用域判定
  const tokens = `${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`.toLowerCase().split(/[\s_-]+/)
  for (const t of tokens) {
    const r = REGION_BY_TOKEN[t]
    if (r) return (r === 'header' || r === 'footer') && isScoped(el) ? null : r
  }
  return null
}

// 就近祖先优先；例外：nav 外层还有全站 footer 时算 footer（页脚导航），页眉里的主导航仍是 nav。
const TEMPLATE_IMG_REGIONS = new Set<LinkRegion>(['header', 'footer', 'nav'])
const SMALL_IMG_PX = 48
function isDecorativeImg(img: Element): boolean {
  const role = img.getAttribute('role')?.trim().toLowerCase()
  if (role === 'presentation' || role === 'none' || img.getAttribute('aria-hidden')?.trim() === 'true') return true
  const w = Number.parseInt(img.getAttribute('width') ?? '', 10)
  const h = Number.parseInt(img.getAttribute('height') ?? '', 10)
  if (w > 0 && h > 0 && w <= SMALL_IMG_PX && h <= SMALL_IMG_PX) return true
  return TEMPLATE_IMG_REGIONS.has(linkRegion(img))
}

export function linkRegion(a: Element): LinkRegion {
  let nearest: LinkRegion | null = null
  for (let el = a.parentElement; el; el = el.parentElement) {
    const r = regionOfElement(el)
    if (!r) continue
    if (nearest === null) {
      if (r !== 'nav') return r
      nearest = r
    } else if (r === 'footer') {
      return 'footer'
    }
  }
  return nearest ?? 'body'
}

const clipAnchor = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_ANCHOR_CHARS)

// 锚文本：可见文本 → 链接内 img alt →（area 的）alt → aria-label → title → 空串。
export function anchorText(a: Element): string {
  // <area> 无文本内容，alt 即其锚文本。
  const candidates = [a.textContent, a.querySelector('img[alt]')?.getAttribute('alt'), a.getAttribute('alt'), a.getAttribute('aria-label'), a.getAttribute('title')]
  for (const c of candidates) {
    const v = clipAnchor(c ?? '')
    if (v) return v
  }
  return ''
}

const relOf = (a: Element): LinkRel[] => {
  const tokens = (a.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
  return REL_VALUES.filter((r) => tokens.includes(r))
}

// 解析基准必须是原始 URL：归一化会去掉目录末尾斜杠，/docs/ 上的 href="intro" 会被错解成 /intro。
function resolveBase(document: ReturnType<typeof parseHTML>['document'], pageUrl: string): string {
  // <base href> 改变相对链接的解析基准（spec S1 Review Focus 2）。
  const baseHref = document.querySelector('base[href]')?.getAttribute('href')
  if (!baseHref) return pageUrl
  try {
    return new URL(baseHref, pageUrl).toString()
  } catch {
    return pageUrl
  }
}

function extractLinks(document: ReturnType<typeof parseHTML>['document'], pageUrl: string, entryHost: string) {
  const base = resolveBase(document, pageUrl)
  const self = normalizeUrl(pageUrl) ?? pageUrl
  const internal = new Map<string, { count: number; anchors: string[]; regions: LinkRegion[]; anyFollow: boolean; href?: string }>()
  const external = new Map<string, ExternalLinkDetail>()
  let truncated = false
  let externalTruncated = false
  // <area href>（图片热区导航）与 <a href> 同为可跟随链接（真实站点 paulgraham.com：首页导航全是 area）。
  const contacts: ContactLink[] = []
  for (const a of document.querySelectorAll('a[href], area[href]')) {
    const raw = a.getAttribute('href') ?? ''
    const contact = contactKindOf(raw, base)
    if (contact) {
      const region = linkRegion(a)
      if (!contacts.some((c) => c.kind === contact && c.region === region)) contacts.push({ kind: contact, region })
      continue
    }
    const n = normalizeUrl(raw, base)
    if (!n || n === self) continue
    // Cloudflare 保留路径（/cdn-cgi/…）是基础设施端点，不是内容页：不进链接图（2026-10-03 ruanyifeng.com 冒烟）。
    if (isSameSite(n, entryHost) && new URL(n).pathname.startsWith('/cdn-cgi/')) continue
    const href = rawResolved(raw, base)
    const rel = relOf(a)
    const region = linkRegion(a)
    const anchor = anchorText(a)
    if (isSameSite(n, entryHost)) {
      let acc = internal.get(n)
      if (!acc) {
        if (internal.size >= MAX_INTERNAL_LINK_TARGETS) {
          truncated = true
          continue
        }
        acc = { count: 0, anchors: [], regions: [], anyFollow: false, ...(href && href !== n ? { href } : {}) }
        internal.set(n, acc)
      }
      acc.count++
      if (anchor && !acc.anchors.includes(anchor) && acc.anchors.length < MAX_ANCHORS_PER_TARGET) acc.anchors.push(anchor)
      if (!acc.regions.includes(region)) acc.regions.push(region)
      if (rel.length === 0) acc.anyFollow = true
    } else if (!external.has(n)) {
      if (external.size >= MAX_EXTERNAL_LINKS) {
        externalTruncated = true
        continue
      }
      external.set(n, { url: n, host: new URL(n).hostname.replace(/^www\./, ''), anchor, region, rel, ...(href && href !== n ? { href } : {}) })
    }
  }
  const linkDetails: InternalLinkDetail[] = [...internal].map(([url, acc]) => ({
    url, count: acc.count, anchors: acc.anchors, regions: acc.regions, nofollow: !acc.anyFollow, ...(acc.href ? { href: acc.href } : {}),
  }))
  return { linkDetails, externalLinks: [...external.values()], truncated, externalTruncated, contacts }
}

// mailto:/tel: 与 Cloudflare 邮箱混淆链接（浏览器端脚本把 /cdn-cgi/l/email-protection#… 还原成 mailto:）。
function contactKindOf(raw: string, base: string): ContactLink['kind'] | null {
  const t = raw.trim()
  if (/^mailto:/i.test(t)) return 'email'
  if (/^tel:/i.test(t)) return 'phone'
  try {
    return new URL(t, base).pathname.startsWith('/cdn-cgi/l/email-protection') ? 'email' : null
  } catch {
    return null
  }
}

// 原始解析地址（不做归一化，只去 fragment）：浏览器点击实际请求的就是它。
function rawResolved(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    return u.toString()
  } catch {
    return null
  }
}

const isHttpsUrl = (u: string): boolean => {
  try {
    return new URL(u).protocol === 'https:'
  } catch {
    return u.startsWith('https://')
  }
}

// 会加载资源的 link rel（混合内容计数用）。
const RESOURCE_LINK_RELS = new Set(['stylesheet', 'preload', 'modulepreload', 'icon', 'manifest', 'apple-touch-icon'])

// 解析扩展信号：isHttps/redirected 由 URL/响应决定，此处不算；mixedContentCount 先按原始
// http:// 资源计数，https 判定在 fetchLightCheck 收敛（非 https 页不构成混合内容）。
function parseExtra(document: ReturnType<typeof parseHTML>['document']): Omit<LightCheckExtra, 'isHttps' | 'redirected'> {
  const hasViewport = document.querySelector('meta[name="viewport"]') !== null

  const hreflangEntries: { hreflang: string; href: string }[] = []
  for (const link of document.querySelectorAll('link[hreflang]')) {
    const hreflang = link.getAttribute('hreflang')?.trim() ?? ''
    const href = link.getAttribute('href')?.trim() ?? ''
    if (hreflang) hreflangEntries.push({ hreflang, href })
  }

  const imgs = [...document.querySelectorAll('img')]
  const imgCount = imgs.length
  const missingAlt = (img: Element) => !(img.getAttribute('alt')?.trim())
  const imgAltMissing = imgs.filter(missingAlt).length
  const contentImgs = imgs.filter((img) => !isDecorativeImg(img))
  const contentImgCount = contentImgs.length
  const contentImgAltMissing = contentImgs.filter(missingAlt).length

  const listCount = document.querySelectorAll('ul').length + document.querySelectorAll('ol').length
  const tableCount = document.querySelectorAll('table').length

  const paras = [...document.querySelectorAll('p')]
  const avgParagraphLen = paras.length
    ? paras.reduce((sum, p) => sum + wordCount(p.textContent ?? ''), 0) / paras.length
    : 0

  const h2s = [...document.querySelectorAll('h2')]
  const h2QuestionRate = h2s.length
    ? h2s.filter((h) => isQuestionHeading(h.textContent ?? '')).length / h2s.length
    : 0

  // 混合内容只算会加载资源的元素（SP-A §5.2 #3）：src / object[data] / srcset 每一项 / 资源型 link 的 href；
  // a[href] 与 canonical / alternate 等链接型 link 不加载资源，不计。
  let mixedContentCount = 0
  const isHttp = (v: string | null | undefined) => (v ?? '').trim().toLowerCase().startsWith('http://')
  for (const el of document.querySelectorAll('img[src], script[src], iframe[src], video[src], audio[src], source[src], embed[src]')) {
    if (isHttp(el.getAttribute('src'))) mixedContentCount++
  }
  for (const el of document.querySelectorAll('object[data]')) {
    if (isHttp(el.getAttribute('data'))) mixedContentCount++
  }
  for (const el of document.querySelectorAll('img[srcset], source[srcset]')) {
    for (const candidate of (el.getAttribute('srcset') ?? '').split(',')) {
      if (isHttp(candidate.trim().split(/\s+/)[0])) mixedContentCount++
    }
  }
  for (const el of document.querySelectorAll('link[href]')) {
    const rels = (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
    if (rels.some((r) => RESOURCE_LINK_RELS.has(r)) && isHttp(el.getAttribute('href'))) mixedContentCount++
  }

  return { hasViewport, hreflangEntries, imgCount, imgAltMissing, contentImgCount, contentImgAltMissing, listCount, tableCount, avgParagraphLen, h2QuestionRate, mixedContentCount }
}

// 附加抽取器单独隔离（第三轮独立审查 P0-1）：抛错只让 article 为空，不能让整页落入 error、丢掉出链。
function safeArticleSignals(document: ReturnType<typeof parseHTML>['document'], pageUrl: string, entryHost: string): ArticleSignals | undefined {
  try {
    return extractArticleSignals(document, pageUrl, entryHost)
  } catch {
    return undefined
  }
}

const QR_HINT = /weixin|wechat|公众号|二维码|qr-?code|微信/i
function hasSocialQrHint(document: ReturnType<typeof parseHTML>['document']): boolean {
  for (const img of document.querySelectorAll('img')) {
    const label = `${img.getAttribute('alt') ?? ''} ${img.getAttribute('src') ?? ''} ${img.getAttribute('title') ?? ''} ${img.getAttribute('class') ?? ''}`
    if (!QR_HINT.test(label)) continue
    const region = linkRegion(img)
    if (region === 'header' || region === 'footer' || region === 'nav' || region === 'aside') return true
  }
  return false
}

// 非破坏性遍历可见文本（不修改 document，其他抽取器不受影响）。
const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG'])
function visibleText(node: Node, out: string[] = []): string[] {
  if (node.nodeType === 1 && SKIP_TEXT.has((node as Element).tagName.toUpperCase())) return out
  if (node.nodeType === 3) out.push(node.textContent ?? '')
  for (const child of node.childNodes) visibleText(child, out)
  return out
}

function textHashOf(document: ReturnType<typeof parseHTML>['document']): string | null {
  const text = visibleText(document.body ?? document).join(' ').replace(/\s+/g, ' ').trim()
  return text ? sha256Hex(text) : null
}

export function parseLightCheckHtml(html: string, pageUrl: string, entryHost: string) {
  const { document } = parseHTML(html)
  const title = document.querySelector('title')?.textContent?.trim() || null
  const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
  const metaRobots = document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null
  const links = extractLinks(document, pageUrl, entryHost)
  return {
    title,
    canonicalUrl,
    metaRobots,
    mainTextChars: extractMainTextChars(html),
    internalLinks: links.linkDetails.map((d) => d.url),
    linkDetails: links.linkDetails,
    externalLinks: links.externalLinks,
    extra: {
      ...parseExtra(document),
      linkDetailsTruncated: links.truncated,
      externalLinksTruncated: links.externalTruncated,
      article: safeArticleSignals(document, pageUrl, entryHost),
      socialQrHint: hasSocialQrHint(document),
      textHash: textHashOf(document),
      ...(links.contacts.length ? { contactLinks: links.contacts } : {}),
    },
  }
}

const EMPTY_PARSE = {
  title: null, canonicalUrl: null, metaRobots: null, mainTextChars: 0, internalLinks: [] as string[],
  linkDetails: [] as InternalLinkDetail[], externalLinks: [] as ExternalLinkDetail[],
}

// 单页轻检永不抛错：失败收敛为 checkStatus='error'，run 不因单页中断。
// 按字节读取后自行解码（S1 修复波）：Content-Type charset → BOM → <meta charset>/http-equiv → 合法 UTF-8 → windows-1252。
// 中文 B2B 站大量使用 GBK/GB2312；一律按 UTF-8 解码会让标题、锚文本、正文统计全部失真。
export async function fetchLightCheck(
  url: string,
  entryHost: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<LightCheckPage> {
  try {
    const res = await fetchImpl(url, { timeoutMs: 10_000 })
    const finalUrl = normalizeUrl(res.url || url) ?? url
    const isHttps = isHttpsUrl(finalUrl)
    // 请求的可能是原始 href（带末尾斜杠/www/参数）：按归一化后比较，避免把「原样请求」误判为跳转。
    const redirected = finalUrl !== (normalizeUrl(url) ?? url)
    const contentType = res.headers.get('content-type') ?? ''
    let kind = contentKindOf(contentType)
    const empty = (k: ContentKind) =>
      ({ url, finalUrl, httpStatus: res.status, ...EMPTY_PARSE, extra: { ...emptyLightCheckExtra(isHttps, redirected), contentKind: k }, contentHash: '', checkStatus: 'checked' as const, errorReason: null })
    if (res.status >= 400) return empty(kind)
    if (kind !== 'html' && contentType.trim() !== '') return empty(kind)
    const html = decodeBody(await readBodyLimited(res), contentType)
    // 缺 Content-Type 时按内容嗅探：允许前置 <?xml ?> 声明与注释，随后以 <!doctype html> / <html 开头才当 HTML。
    if (kind !== 'html') {
      if (!/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype html|<html[\s>])/i.test(html.slice(0, 4096))) return empty('other')
      kind = 'html'
    }
    // 用原始最终 URL 做相对链接解析基准（保留目录末尾斜杠）；自链接判定在 extractLinks 内归一化后比较。
    const parsed = parseLightCheckHtml(html, res.url || url, entryHost)
    return {
      url,
      finalUrl,
      httpStatus: res.status,
      ...parsed,
      // http:// 资源仅在 https 页上构成混合内容；非 https 页归零避免误报。
      extra: { ...parsed.extra, isHttps, redirected, mixedContentCount: isHttps ? parsed.extra.mixedContentCount : 0, contentKind: kind },
      contentHash: sha256Hex(html),
      checkStatus: 'checked',
      errorReason: null,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'fetch_failed'
    // finalUrl 与成功路径一样归一化：请求的可能是原始 href（带 www/末尾斜杠），不归一化会被链接图当成一次跳转（2026-10-03 jac.com.cn 冒烟）。
    return { url, finalUrl: normalizeUrl(url) ?? url, httpStatus: 0, ...EMPTY_PARSE, extra: emptyLightCheckExtra(isHttpsUrl(url), false), contentHash: '', checkStatus: 'error', errorReason: reason }
  }
}

const MEDIA_TYPE = /^(image|video|audio|font)\/|^application\/(zip|x-zip-compressed|gzip|x-gzip|x-7z-compressed|x-rar-compressed|x-tar|octet-stream|font-|x-font)/
const DOCUMENT_TYPE = /^application\/(pdf|msword|rtf|vnd\.ms-|vnd\.openxmlformats-officedocument|vnd\.oasis\.opendocument)/
const RESOURCE_TYPE = /^(text\/(css|javascript|plain|csv|xml|calendar)|application\/(javascript|x-javascript|json|ld\+json|manifest\+json|xml|rss\+xml|atom\+xml|rdf\+xml))$/
export function contentKindOf(contentType: string): ContentKind {
  const mime = contentType.toLowerCase().split(';')[0].trim()
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'
  if (DOCUMENT_TYPE.test(mime)) return 'document'
  if (RESOURCE_TYPE.test(mime)) return 'resource'
  if (MEDIA_TYPE.test(mime)) return 'media'
  return 'other'
}

// 正文读取上限与超时（第二轮独立审查 #18）：safeFetch 拿到响应头即清计时器，读 body 不受约束。
export const MAX_BODY_BYTES = 5 * 1024 * 1024
const BODY_TIMEOUT_MS = 15_000
export async function readBodyLimited(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array(await res.arrayBuffer())
  const chunks: Uint8Array[] = []
  let size = 0
  const deadline = Date.now() + BODY_TIMEOUT_MS
  try {
    while (size < MAX_BODY_BYTES) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      const next = await Promise.race([
        reader.read(),
        new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), remaining)),
      ])
      if (next === 'timeout' || next.done) break
      chunks.push(next.value)
      size += next.value.byteLength
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const out = new Uint8Array(Math.min(size, MAX_BODY_BYTES))
  let offset = 0
  for (const c of chunks) {
    const take = Math.min(c.byteLength, out.byteLength - offset)
    out.set(c.subarray(0, take), offset)
    offset += take
    if (offset >= out.byteLength) break
  }
  return out
}

// Node 的 TextDecoder('windows-1252') 实际按 ISO-8859-1 解码（0x80–0x9F 变成 C1 控制符，实测），
// 而 WHATWG 规定这些标签都按 windows-1252：0x93 应为 “。这里手动补映射。
const CP1252_C1: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
  0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
}
const WINDOWS_1252_LABELS = new Set(['windows-1252', 'cp1252', 'x-cp1252', 'latin1', 'iso-8859-1', 'iso8859-1', 'l1', 'ascii', 'us-ascii'])

export function decodeWindows1252(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += String.fromCharCode(CP1252_C1[b] ?? b)
  return out
}

function tryDecoder(label: string | undefined, bytes: Uint8Array, fatal = false): string | null {
  if (!label) return null
  const l = label.trim().toLowerCase()
  if (WINDOWS_1252_LABELS.has(l)) return decodeWindows1252(bytes)
  try {
    return new TextDecoder(l, { fatal }).decode(bytes)
  } catch {
    return null
  }
}

export function decodeBody(bytes: Uint8Array, contentType: string): string {
  // WHATWG：BOM 优先于一切声明（第二轮独立审查 #14）。
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  const fromHeader = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType)?.[1]
  const headerDecoded = tryDecoder(fromHeader, bytes)
  if (headerDecoded !== null) return headerDecoded
  // 前 8KB 按单字节解码（ASCII 兼容）找 <meta charset> 或 http-equiv：不少中文站 meta 前有大段内联脚本。
  const head = decodeWindows1252(bytes.subarray(0, 8192))
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1]
  const metaDecoded = tryDecoder(fromMeta, bytes)
  if (metaDecoded !== null) return metaDecoded
  return tryDecoder('utf-8', bytes, true) ?? decodeWindows1252(bytes)
}
