// GEO 采集器 —— 第三方语料存在度（G07）。
//
// 定位（见 v3 方法论 GEO 支柱「品牌是否已进入 LLM 常引用的第三方语料」）：
//   LLM 的答案更依赖高权威、被反复引用的第三方来源（维基百科、Reddit 讨论）而非品牌官网。
//   - Wikipedia：英文维基是否有品牌条目 —— LLM 事实性问答的高频来源，存在与否是强信号。
//   - Reddit：近窗口期内的品牌提及量 —— UGC 语料的活跃度代理，反映品牌在讨论语料中的存在感。
//
// 本模块是自包含纯采集器：不落库、不耦合 RuleContext。
// 所有外部调用均免 key（公开 API），但可能被限流 —— 一律 try/catch 降级，绝不抛出。

const WIKIPEDIA_SEARCH_ENDPOINT = 'https://en.wikipedia.org/w/api.php'
const REDDIT_SEARCH_ENDPOINT = 'https://www.reddit.com/search.json'

// ── 严格等于的返回契约（勿改字段）─────────────────────────────────
export interface ThirdPartyResult {
  wikipedia: { exists: boolean; title: string | null; url: string | null }
  reddit: { mentions: number; windowDays: number }
}

export interface ThirdPartyInput {
  brand: string
  windowDays?: number
}

// Reddit 提及默认统计窗口（天）。
const DEFAULT_WINDOW_DAYS = 365

// 未命中/失败时的中性降级值。
const EMPTY_WIKIPEDIA = { exists: false, title: null, url: null } as const

// ── Wikipedia 响应最小形状（仅取用字段）───────────────────────────
interface WikipediaSearchResponse {
  query?: { search?: { title?: string }[] }
}

/**
 * 从英文维基搜索品牌条目：命中取第一条 title，并据此构造条目 URL。
 * 失败/无结果 → { exists:false, title:null, url:null }，绝不抛出。
 */
async function checkWikipedia(
  brand: string,
  fetchImpl: typeof fetch,
): Promise<ThirdPartyResult['wikipedia']> {
  try {
    const url = new URL(WIKIPEDIA_SEARCH_ENDPOINT)
    url.searchParams.set('action', 'query')
    url.searchParams.set('list', 'search')
    url.searchParams.set('srsearch', brand)
    url.searchParams.set('format', 'json')
    url.searchParams.set('origin', '*') // 允许匿名跨域调用

    const res = await fetchImpl(url.toString(), { method: 'GET' })
    if (!res.ok) return { ...EMPTY_WIKIPEDIA }

    const body = (await res.json()) as WikipediaSearchResponse
    const first = body.query?.search?.[0]
    const title = first?.title
    if (!title) return { ...EMPTY_WIKIPEDIA }

    // 维基条目 URL：空格转下划线（标准 wiki 路由约定）。
    const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
    return { exists: true, title, url: pageUrl }
  } catch {
    return { ...EMPTY_WIKIPEDIA }
  }
}

// ── Reddit 响应最小形状（仅取用字段）─────────────────────────────
interface RedditListingResponse {
  data?: {
    children?: {
      data?: {
        created_utc?: number
      }
    }[]
  }
}

/**
 * 统计 Reddit 近 windowDays 内含品牌的帖子数。
 * 用 created_utc 过滤窗口（服务端 t=year 已粗过滤，此处按精确天数二次过滤）。
 * 失败/被限流 → mentions:0，绝不抛出。
 */
async function checkReddit(
  brand: string,
  windowDays: number,
  fetchImpl: typeof fetch,
): Promise<number> {
  try {
    const url = new URL(REDDIT_SEARCH_ENDPOINT)
    url.searchParams.set('q', brand)
    url.searchParams.set('sort', 'new')
    url.searchParams.set('limit', '25')
    url.searchParams.set('t', 'year')

    const res = await fetchImpl(url.toString(), { method: 'GET' })
    if (!res.ok) return 0

    const body = (await res.json()) as RedditListingResponse
    const children = body.data?.children ?? []

    // 窗口下界（秒级 Unix 时间戳）。
    const cutoffSec = Date.now() / 1000 - windowDays * 24 * 60 * 60
    let mentions = 0
    for (const child of children) {
      const createdUtc = child.data?.created_utc
      // 无时间戳的条目按「窗口内」计（服务端已限定 t=year，避免误丢）。
      if (typeof createdUtc !== 'number' || createdUtc >= cutoffSec) mentions += 1
    }
    return mentions
  } catch {
    return 0
  }
}

/**
 * G07 采集入口：并行查询 Wikipedia 与 Reddit，聚合为第三方语料存在度。
 * 两个来源相互独立，任一失败不影响另一个（各自内部已降级）。
 * @param fetchImpl 可注入的 fetch（测试用 mock）
 */
export async function checkThirdPartyPresence(
  input: ThirdPartyInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ThirdPartyResult> {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS

  const [wikipedia, mentions] = await Promise.all([
    checkWikipedia(input.brand, fetchImpl),
    checkReddit(input.brand, windowDays, fetchImpl),
  ])

  return {
    wikipedia,
    reddit: { mentions, windowDays },
  }
}
