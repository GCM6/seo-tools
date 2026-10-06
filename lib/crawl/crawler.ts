import { parseRobotsAllowed } from '@/lib/collection/robots'
import { fetchLightCheck, emptyLightCheckExtra, type LightCheckPage } from './light-check'
import { isSameSite } from './url'

export type DiscoveredVia = 'entry' | 'sitemap' | 'crawl' | 'both'

// 抓取策略（spec S1 §4）：首页链接优先（BFS 层序），sitemap 保留 20% 预算做补充抽样。
export const CRAWL_STRATEGY = 'link_first_v1'
export const SITEMAP_RESERVE_RATIO = 0.2

// fetch：原始请求地址（与归一化键 url 不同时）——浏览器点击的是原始 href，归一化只作去重键（第二轮独立审查 #6）。
type FrontierItem = { url: string; depth: number | null; via: DiscoveredVia; fetch?: string }

// 状态是纯 JSON：要在 Inngest step.run 之间序列化往返（不要放 URL/Set/Map）。
// 入度不在状态里：由图谱构建时从已落库的 linkDetails 重算（spec S1 §7，控制跨 step 体积）。
export interface CrawlState {
  entryHost: string
  frontier: FrontierItem[] // 链接发现队列（FIFO = BFS 层序）
  sitemapQueue: string[]
  sitemapTotal: number
  visited: Record<string, 1> // 已抓或已判 robots 禁抓，出队时跳过
  fetchUrls: Record<string, string> // 入口与 sitemap URL 的原始请求地址（仅与键不同时）
  seen: Record<string, DiscoveredVia>
  checkedCount: number
  done: boolean
}

export interface CrawlOptions {
  maxPages: number
  maxDepth: number
  batchSize: number
  concurrency: number
  robotsTxt: string
}

export interface CrawlPageResult extends Omit<LightCheckPage, 'checkStatus'> {
  checkStatus: 'checked' | 'error' | 'blocked_by_robots'
  discoveredVia: DiscoveredVia
  depth: number | null
}

export function createCrawlState(
  entryUrl: string,
  sitemapUrls: string[],
  entryHost: string,
  opts: { fetchUrls?: Record<string, string> } = {},
): CrawlState {
  const seen: Record<string, DiscoveredVia> = { [entryUrl]: 'entry' }
  const sitemapQueue: string[] = []
  for (const u of sitemapUrls) {
    if (seen[u]) continue
    seen[u] = 'sitemap'
    sitemapQueue.push(u)
  }
  return {
    entryHost,
    frontier: [{ url: entryUrl, depth: 0, via: 'entry', ...(opts.fetchUrls?.[entryUrl] ? { fetch: opts.fetchUrls[entryUrl] } : {}) }],
    sitemapQueue,
    sitemapTotal: sitemapQueue.length,
    visited: {},
    fetchUrls: opts.fetchUrls ?? {},
    seen,
    checkedCount: 0,
    done: false,
  }
}

function blockedResult(item: { url: string; depth: number | null; via: DiscoveredVia }): CrawlPageResult {
  return {
    url: item.url, finalUrl: item.url, httpStatus: 0, title: null, canonicalUrl: null, metaRobots: null,
    mainTextChars: 0, contentHash: '', internalLinks: [], linkDetails: [], externalLinks: [], extra: emptyLightCheckExtra(item.url.startsWith('https://'), false), errorReason: null,
    checkStatus: 'blocked_by_robots', discoveredVia: item.via, depth: item.depth,
  }
}

// robots 判定（第三轮独立审查 P2-11）：归一化会去掉末尾斜杠，`Disallow: /private/` 匹配不到 `/private`；
// 实际请求的是原始地址，所以原始路径、归一化路径及其带斜杠写法任一被禁即视为禁抓。
function robotsAllows(robotsTxt: string, url: string, fetchUrl?: string): boolean {
  const paths = new Set<string>()
  for (const u of [url, fetchUrl]) {
    if (!u) continue
    try {
      const p = new URL(u).pathname || '/'
      paths.add(p)
      if (!p.endsWith('/')) paths.add(`${p}/`)
    } catch {
      // ignore
    }
  }
  return [...paths].every((p) => parseRobotsAllowed(robotsTxt, p))
}

export async function runCrawlBatch(
  state: CrawlState,
  opts: CrawlOptions,
  fetchImpl: typeof fetchLightCheck = fetchLightCheck,
): Promise<{ state: CrawlState; results: CrawlPageResult[] }> {
  const next: CrawlState = {
    ...state,
    frontier: [...state.frontier],
    sitemapQueue: [...state.sitemapQueue],
    visited: { ...state.visited },
    seen: { ...state.seen },
  }
  const results: CrawlPageResult[] = []
  // 已在本批实际抓取的页数（robots 禁抓不计）。用它做本批配额，同时受全局 maxPages 约束。
  let processed = 0
  const linkBudget = opts.maxPages - Math.min(next.sitemapTotal, Math.floor(opts.maxPages * SITEMAP_RESERVE_RATIO))

  // 出队：链接阶段只取链接；链接队列暂空但本块已有在抓项时停止组块，等新链接回来（不提前消耗 sitemap 预留）。
  // 链接预算用尽（或链接真的耗尽）后取 sitemap；sitemap 也耗尽再回到链接。已访问项跳过。
  const takeNext = (inChunk: number): FrontierItem | null => {
    while (next.frontier.length && next.visited[next.frontier[0].url]) next.frontier.shift()
    while (next.sitemapQueue.length && next.visited[next.sitemapQueue[0]]) next.sitemapQueue.shift()
    if (next.checkedCount + inChunk < linkBudget) {
      if (next.frontier.length) return next.frontier.shift()!
      if (inChunk > 0) return null
    }
    if (next.sitemapQueue.length) {
      const url = next.sitemapQueue.shift()!
      return { url, depth: null, via: next.seen[url] ?? 'sitemap', ...(next.fetchUrls[url] ? { fetch: next.fetchUrls[url] } : {}) }
    }
    return next.frontier.shift() ?? null
  }

  // 循环组块处理：处理中新发现的内链会 push 回 frontier，
  // 因此同一次 runCrawlBatch 内可继续消费，直到本批配额 / maxPages / 两个队列耗尽。
  while (processed < opts.batchSize && next.checkedCount < opts.maxPages) {
    const chunk: FrontierItem[] = []
    while (
      chunk.length < opts.concurrency &&
      processed + chunk.length < opts.batchSize &&
      next.checkedCount + chunk.length < opts.maxPages
    ) {
      const item = takeNext(chunk.length)
      if (!item) break
      next.visited[item.url] = 1
      if (!robotsAllows(opts.robotsTxt, item.url, item.fetch)) {
        // robots 禁抓：不消耗页面配额，但记录该 URL 的存在（本身是诊断信号）。
        results.push(blockedResult({ ...item, via: next.seen[item.url] ?? item.via }))
        continue
      }
      chunk.push(item)
    }
    if (!chunk.length) break

    const pages = await Promise.all(chunk.map((item) => fetchImpl(item.fetch ?? item.url, state.entryHost)))
    pages.forEach((fetched, j) => {
      const item = chunk[j]
      next.checkedCount++
      processed++
      // 结果以归一化键为 url（请求的可能是原始 href）。
      const page: LightCheckPage = { ...fetched, url: item.url }
      // 跳转落到 robots 禁抓路径：搜索引擎同样不会抓取跳转目标，记为禁抓、出链不入队（第二轮独立审查 #7）。
      if (page.finalUrl !== item.url && isSameSite(page.finalUrl, state.entryHost)) {
        if (!robotsAllows(opts.robotsTxt, page.finalUrl)) {
          results.push({
            ...blockedResult({ ...item, via: next.seen[item.url] ?? item.via }),
            finalUrl: page.finalUrl,
            httpStatus: page.httpStatus,
            errorReason: 'redirect_to_disallowed',
          })
          return
        }
      }
      for (const detail of page.linkDetails) {
        const link = detail.url
        const known = next.seen[link]
        if (known && known !== 'sitemap') continue
        if (known === 'sitemap') next.seen[link] = 'both'
        // 深度未知页（仅 sitemap 抓到）的出链深度也未知：不受 maxDepth 约束，只受 maxPages 约束。
        const depth = item.depth === null ? null : item.depth + 1
        // 超深链接不入队（预算控制）；仍作为源页 linkDetails 的目标进入图谱，深度由图谱算出（修 D2）。
        if (depth !== null && depth > opts.maxDepth) continue
        if (!known) next.seen[link] = 'crawl'
        next.frontier.push({ url: link, depth, via: next.seen[link], ...(detail.href ? { fetch: detail.href } : {}) })
      }
      results.push({ ...page, checkStatus: page.checkStatus, discoveredVia: next.seen[item.url] ?? item.via, depth: item.depth })
    })
  }

  next.frontier = next.frontier.filter((f) => !next.visited[f.url])
  next.sitemapQueue = next.sitemapQueue.filter((u) => !next.visited[u])
  next.done = next.checkedCount >= opts.maxPages || (next.frontier.length === 0 && next.sitemapQueue.length === 0)
  return { state: next, results }
}

export function leftoverDiscovered(state: CrawlState): { url: string; via: DiscoveredVia; depth: number | null }[] {
  const out = new Map<string, { url: string; via: DiscoveredVia; depth: number | null }>()
  for (const f of state.frontier) {
    if (!state.visited[f.url] && !out.has(f.url)) out.set(f.url, { url: f.url, via: state.seen[f.url] ?? f.via, depth: f.depth })
  }
  for (const u of state.sitemapQueue) {
    if (!state.visited[u] && !out.has(u)) out.set(u, { url: u, via: state.seen[u] ?? 'sitemap', depth: null })
  }
  return [...out.values()]
}
