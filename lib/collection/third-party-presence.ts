// GEO 采集器 —— 第三方语料存在度（G07）。
//
// 定位（见 v3 方法论 GEO 支柱「品牌是否已进入 LLM 常引用的第三方语料」）：
//   LLM 的答案更依赖高权威、被反复引用的第三方来源（维基百科、Reddit 讨论）而非品牌官网。
//   - Wikipedia：英文维基是否有与品牌名/别名**同名**的词条（SP-A §4.4：精确标题，不再用全文搜索）。
//   - Reddit：近窗口期内的品牌提及量 —— UGC 语料的活跃度代理。
//
// 本模块是自包含纯采集器：不落库、不耦合 RuleContext。公开 API 免 key，但可能被限流或拦截——
// 失败一律如实返回 status:'failed' + 原因（SP-A §4.1），绝不把失败记成"无词条 / 0 条"，也不抛出。

import { readRaw, reasonOf, type RawResponse } from './result'

const WIKIPEDIA_API_ENDPOINT = 'https://en.wikipedia.org/w/api.php'
const REDDIT_SEARCH_ENDPOINT = 'https://www.reddit.com/search.json'
// Wikimedia API 礼仪：带可识别的 User-Agent（不带联系人信息）。
const WIKIPEDIA_USER_AGENT = 'VerisSEOAudit/1.0 (self-hosted SEO/GEO diagnostics)'

// Reddit 提及默认统计窗口（天）。
const DEFAULT_WINDOW_DAYS = 365
// MediaWiki 一次查询的候选标题上限（品牌名 + 别名）。
const MAX_TITLE_CANDIDATES = 4

export type WikipediaCheck =
  | { status: 'ok'; exists: boolean; title: string | null; url: string | null }
  | { status: 'failed'; httpStatus: number | null; reason: string }

export type RedditCheck =
  | { status: 'ok'; mentions: number; windowDays: number }
  | { status: 'failed'; httpStatus: number | null; reason: string; windowDays: number }

// 证据载荷 v2（SP-A §4.4）。v1（无 version 字段）是旧版：维基用全文搜索判存在、Reddit 失败记 0。
export interface ThirdPartyPayload {
  version: 2
  candidates: string[]
  wikipedia: WikipediaCheck
  reddit: RedditCheck
}

export interface ThirdPartyPayloadV1 {
  wikipedia?: { exists?: boolean; title?: string | null; url?: string | null }
  reddit?: { mentions?: number; windowDays?: number }
}

export interface ThirdPartyInput {
  brand: string
  aliases?: string[]
  windowDays?: number
}

export interface ThirdPartyOutcome {
  payload: ThirdPartyPayload
  // 有响应（不论成败）的来源原文，由编排层存入 evidence_raw。
  raws: { source: 'wikipedia' | 'reddit'; raw: RawResponse }[]
}

// MediaWiki 标题首字母大小写不敏感、其余敏感：首字母大写后再去重。
const capitalizeFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

export function titleCandidates(brand: string, aliases: string[] = []): string[] {
  const out: string[] = []
  for (const raw of [brand, ...aliases]) {
    const t = capitalizeFirst(raw.trim())
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= MAX_TITLE_CANDIDATES) break
  }
  return out
}

interface MediaWikiPage {
  title?: string
  missing?: boolean
  invalid?: boolean
  pageprops?: Record<string, unknown>
}

async function checkWikipedia(
  candidates: string[],
  fetchImpl: typeof fetch,
): Promise<{ check: WikipediaCheck; raw: RawResponse | null }> {
  if (candidates.length === 0) return { check: { status: 'failed', httpStatus: null, reason: 'no_candidates' }, raw: null }
  const url = new URL(WIKIPEDIA_API_ENDPOINT)
  url.searchParams.set('action', 'query')
  url.searchParams.set('titles', candidates.join('|'))
  url.searchParams.set('redirects', '1')
  url.searchParams.set('prop', 'pageprops')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  let raw: RawResponse
  try {
    raw = await readRaw(await fetchImpl(url.toString(), { method: 'GET', headers: { 'user-agent': WIKIPEDIA_USER_AGENT } }))
  } catch (err) {
    return { check: { status: 'failed', httpStatus: null, reason: reasonOf(err) }, raw: null }
  }
  if (raw.status < 200 || raw.status >= 300) return { check: { status: 'failed', httpStatus: raw.status, reason: `http_${raw.status}` }, raw }
  let body: { error?: { code?: unknown }; query?: { pages?: MediaWikiPage[] } }
  try {
    body = JSON.parse(raw.body)
  } catch {
    return { check: { status: 'failed', httpStatus: raw.status, reason: 'invalid_json' }, raw }
  }
  // MediaWiki 报错时 HTTP 仍是 200，错误在 {"error":{code}} 信封里（如 maxlag / ratelimited）——查询没做成，不是"无词条"。
  if (body.error) return { check: { status: 'failed', httpStatus: raw.status, reason: `api_${String(body.error.code ?? 'error')}` }, raw }
  // 精确标题查询必然返回 query.pages；没有就是响应不完整（第二波审查 I1）。
  if (!Array.isArray(body.query?.pages)) return { check: { status: 'failed', httpStatus: raw.status, reason: 'empty_result' }, raw }
  // 页面存在且不是消歧义页才算有词条。pageprops.disambiguation 的值是空串，必须按键是否存在判断。
  const article = body.query.pages.find(
    (p) => !p.missing && !p.invalid && !!p.title && !Object.prototype.hasOwnProperty.call(p.pageprops ?? {}, 'disambiguation'),
  )
  if (!article?.title) return { check: { status: 'ok', exists: false, title: null, url: null }, raw }
  // 维基条目 URL：空格转下划线（标准 wiki 路由约定）；title 已是重定向后的目标标题。
  const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`
  return { check: { status: 'ok', exists: true, title: article.title, url: pageUrl }, raw }
}

interface RedditListingResponse {
  error?: unknown
  data?: { children?: { data?: { created_utc?: number } }[] }
}

// 统计 Reddit 近 windowDays 内含品牌的帖子数。用 created_utc 按精确天数二次过滤（服务端 t=year 已粗过滤）。
async function checkReddit(
  brand: string,
  windowDays: number,
  fetchImpl: typeof fetch,
): Promise<{ check: RedditCheck; raw: RawResponse | null }> {
  const url = new URL(REDDIT_SEARCH_ENDPOINT)
  url.searchParams.set('q', brand)
  url.searchParams.set('sort', 'new')
  url.searchParams.set('limit', '25')
  url.searchParams.set('t', 'year')
  let raw: RawResponse
  try {
    raw = await readRaw(await fetchImpl(url.toString(), { method: 'GET' }))
  } catch (err) {
    return { check: { status: 'failed', httpStatus: null, reason: reasonOf(err), windowDays }, raw: null }
  }
  // 匿名接口对服务器请求常返回 403 拦截页（2026-10-04 实测）：如实记失败，不做绕过（spec §4.4）。
  if (raw.status < 200 || raw.status >= 300) return { check: { status: 'failed', httpStatus: raw.status, reason: `http_${raw.status}`, windowDays }, raw }
  let body: RedditListingResponse
  try {
    body = JSON.parse(raw.body) as RedditListingResponse
  } catch {
    return { check: { status: 'failed', httpStatus: raw.status, reason: 'invalid_json', windowDays }, raw }
  }
  // 200 也可能是错误体（{"error":429,...}）或别的形态：只有 Listing（data.children 为数组）才算查到了（最终审查 F1-1）。
  if (body.error !== undefined) return { check: { status: 'failed', httpStatus: raw.status, reason: `api_${String(body.error)}`, windowDays }, raw }
  if (!Array.isArray(body.data?.children)) return { check: { status: 'failed', httpStatus: raw.status, reason: 'invalid_shape', windowDays }, raw }
  const cutoffSec = Date.now() / 1000 - windowDays * 24 * 60 * 60
  let mentions = 0
  for (const child of body.data.children) {
    const createdUtc = child.data?.created_utc
    // 无时间戳的条目按「窗口内」计（服务端已限定 t=year，避免误丢）。
    if (typeof createdUtc !== 'number' || createdUtc >= cutoffSec) mentions += 1
  }
  return { check: { status: 'ok', mentions, windowDays }, raw }
}

/**
 * G07 采集入口：并行查询 Wikipedia 与 Reddit。两个来源相互独立，各自如实返回 ok/failed。
 * @param fetchImpl 可注入的 fetch（测试用 mock）
 */
export async function checkThirdPartyPresence(
  input: ThirdPartyInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ThirdPartyOutcome> {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS
  const candidates = titleCandidates(input.brand, input.aliases)
  const [wiki, reddit] = await Promise.all([
    checkWikipedia(candidates, fetchImpl),
    checkReddit(input.brand, windowDays, fetchImpl),
  ])
  const raws: ThirdPartyOutcome['raws'] = []
  if (wiki.raw) raws.push({ source: 'wikipedia', raw: wiki.raw })
  if (reddit.raw) raws.push({ source: 'reddit', raw: reddit.raw })
  return { payload: { version: 2, candidates, wikipedia: wiki.check, reddit: reddit.check }, raws }
}
