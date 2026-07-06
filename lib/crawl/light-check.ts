import { parseHTML } from 'linkedom'
import { safeFetch } from '@/lib/security/safe-fetch'
import { extractMainTextChars } from '@/lib/collection/page-parser'
import { sha256Hex } from '@/lib/collection/hash'
import { normalizeUrl, isSameSite } from './url'

// 轻检扩展信号：单 JSON 列落库，供 T06/T08/T13/T14/C09/C11 规则消费（spec §4.2 通道一）。
export interface LightCheckExtra {
  hasViewport: boolean // <meta name=viewport>（移动优先索引必查）
  hreflangEntries: { hreflang: string; href: string }[] // <link rel=alternate hreflang=..>
  imgCount: number
  imgAltMissing: number // <img> 无非空 alt
  listCount: number // <ul>+<ol>
  tableCount: number // <table>
  avgParagraphLen: number // <p> 的平均词数
  h2QuestionRate: number // <h2> 文本以 ? 结尾或以疑问词开头的比例
  isHttps: boolean // 页面 URL 协议
  mixedContentCount: number // https 页上的 http:// script/img/link 资源数
  redirected: boolean // finalUrl !== 请求 url
}

export interface LightCheckPage {
  url: string
  finalUrl: string
  httpStatus: number
  title: string | null
  canonicalUrl: string | null
  metaRobots: string | null
  mainTextChars: number
  contentHash: string
  internalLinks: string[]
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
  }
}

const isHttpsUrl = (u: string): boolean => {
  try {
    return new URL(u).protocol === 'https:'
  } catch {
    return u.startsWith('https://')
  }
}

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
  const imgAltMissing = imgs.filter((img) => !(img.getAttribute('alt')?.trim())).length

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

  let mixedContentCount = 0
  for (const el of document.querySelectorAll('script[src], img[src]')) {
    if ((el.getAttribute('src') ?? '').startsWith('http://')) mixedContentCount++
  }
  for (const el of document.querySelectorAll('link[href]')) {
    if ((el.getAttribute('href') ?? '').startsWith('http://')) mixedContentCount++
  }

  return { hasViewport, hreflangEntries, imgCount, imgAltMissing, listCount, tableCount, avgParagraphLen, h2QuestionRate, mixedContentCount }
}

export function parseLightCheckHtml(html: string, pageUrl: string, entryHost: string) {
  const { document } = parseHTML(html)
  const title = document.querySelector('title')?.textContent?.trim() || null
  const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
  const metaRobots = document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null
  const internalLinks = new Set<string>()
  for (const a of document.querySelectorAll('a[href]')) {
    const n = normalizeUrl(a.getAttribute('href') ?? '', pageUrl)
    if (n && isSameSite(n, entryHost) && n !== pageUrl) internalLinks.add(n)
  }
  return {
    title,
    canonicalUrl,
    metaRobots,
    mainTextChars: extractMainTextChars(html),
    internalLinks: [...internalLinks],
    extra: parseExtra(document),
  }
}

const EMPTY_PARSE = { title: null, canonicalUrl: null, metaRobots: null, mainTextChars: 0, internalLinks: [] as string[] }

// 单页轻检永不抛错：失败收敛为 checkStatus='error'，run 不因单页中断。
export async function fetchLightCheck(
  url: string,
  entryHost: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<LightCheckPage> {
  try {
    const res = await fetchImpl(url, { timeoutMs: 10_000 })
    const finalUrl = normalizeUrl(res.url || url) ?? url
    const isHttps = isHttpsUrl(finalUrl)
    const redirected = finalUrl !== url
    const contentType = res.headers.get('content-type') ?? ''
    if (res.status >= 400 || !contentType.includes('text/html')) {
      return { url, finalUrl, httpStatus: res.status, ...EMPTY_PARSE, extra: emptyLightCheckExtra(isHttps, redirected), contentHash: '', checkStatus: 'checked', errorReason: null }
    }
    const html = await res.text()
    const parsed = parseLightCheckHtml(html, finalUrl, entryHost)
    return {
      url,
      finalUrl,
      httpStatus: res.status,
      ...parsed,
      // http:// 资源仅在 https 页上构成混合内容；非 https 页归零避免误报。
      extra: { ...parsed.extra, isHttps, redirected, mixedContentCount: isHttps ? parsed.extra.mixedContentCount : 0 },
      contentHash: sha256Hex(html),
      checkStatus: 'checked',
      errorReason: null,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'fetch_failed'
    return { url, finalUrl: url, httpStatus: 0, ...EMPTY_PARSE, extra: emptyLightCheckExtra(isHttpsUrl(url), false), contentHash: '', checkStatus: 'error', errorReason: reason }
  }
}
