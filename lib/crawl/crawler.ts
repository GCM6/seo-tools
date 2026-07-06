import { parseRobotsAllowed } from '@/lib/collection/robots'
import { fetchLightCheck, emptyLightCheckExtra, type LightCheckPage } from './light-check'

export type DiscoveredVia = 'entry' | 'sitemap' | 'crawl' | 'both'

// 状态是纯 JSON：要在 Inngest step.run 之间序列化往返（不要放 URL/Set/Map）。
export interface CrawlState {
  entryHost: string
  frontier: { url: string; depth: number | null; via: DiscoveredVia }[]
  seen: Record<string, DiscoveredVia>
  inbound: Record<string, number>
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

export function createCrawlState(entryUrl: string, sitemapUrls: string[], entryHost: string): CrawlState {
  const seen: Record<string, DiscoveredVia> = { [entryUrl]: 'entry' }
  const frontier: CrawlState['frontier'] = [{ url: entryUrl, depth: 0, via: 'entry' }]
  for (const u of sitemapUrls) {
    if (seen[u]) continue
    seen[u] = 'sitemap'
    frontier.push({ url: u, depth: null, via: 'sitemap' })
  }
  return { entryHost, frontier, seen, inbound: {}, checkedCount: 0, done: frontier.length === 0 }
}

function blockedResult(item: { url: string; depth: number | null; via: DiscoveredVia }): CrawlPageResult {
  return {
    url: item.url, finalUrl: item.url, httpStatus: 0, title: null, canonicalUrl: null, metaRobots: null,
    mainTextChars: 0, contentHash: '', internalLinks: [], extra: emptyLightCheckExtra(item.url.startsWith('https://'), false), errorReason: null,
    checkStatus: 'blocked_by_robots', discoveredVia: item.via, depth: item.depth,
  }
}

export async function runCrawlBatch(
  state: CrawlState,
  opts: CrawlOptions,
  fetchImpl: typeof fetchLightCheck = fetchLightCheck,
): Promise<{ state: CrawlState; results: CrawlPageResult[] }> {
  const next: CrawlState = {
    ...state,
    frontier: [...state.frontier],
    seen: { ...state.seen },
    inbound: { ...state.inbound },
  }
  const results: CrawlPageResult[] = []
  // 已在本批实际抓取的页数（robots 禁抓不计）。用它做本批配额，同时受全局 maxPages 约束。
  let processed = 0

  // 循环从 frontier 取块处理：处理中新发现的内链会 push 回 frontier，
  // 因此同一次 runCrawlBatch 内可继续消费，直到本批配额 / maxPages / frontier 耗尽。
  while (processed < opts.batchSize && next.checkedCount < opts.maxPages && next.frontier.length) {
    const chunk: CrawlState['frontier'] = []
    while (
      chunk.length < opts.concurrency &&
      processed + chunk.length < opts.batchSize &&
      next.checkedCount + chunk.length < opts.maxPages &&
      next.frontier.length
    ) {
      const item = next.frontier.shift()!
      const path = new URL(item.url).pathname || '/'
      if (!parseRobotsAllowed(opts.robotsTxt, path)) {
        // robots 禁抓：不消耗页面配额，但记录该 URL 的存在（本身是诊断信号）。
        results.push(blockedResult({ ...item, via: next.seen[item.url] ?? item.via }))
        continue
      }
      chunk.push(item)
    }
    if (!chunk.length) break

    const pages = await Promise.all(chunk.map((item) => fetchImpl(item.url, state.entryHost)))
    pages.forEach((page, j) => {
      const item = chunk[j]
      next.checkedCount++
      processed++
      for (const link of page.internalLinks) {
        next.inbound[link] = (next.inbound[link] ?? 0) + 1
        const known = next.seen[link]
        if (known === 'sitemap') next.seen[link] = 'both'
        if (!known) {
          // 仅 sitemap 发现的页 depth=null，从它出发的链接按第 1 层计。
          const depth = (item.depth ?? 0) + 1
          // 超过 maxDepth 的链接既不入队也不标 seen（避免虚假的已发现记录）。
          if (depth <= opts.maxDepth) {
            next.seen[link] = 'crawl'
            next.frontier.push({ url: link, depth, via: 'crawl' })
          }
        }
      }
      results.push({ ...page, checkStatus: page.checkStatus, discoveredVia: next.seen[item.url] ?? item.via, depth: item.depth })
    })
  }

  next.done = next.frontier.length === 0 || next.checkedCount >= opts.maxPages
  return { state: next, results }
}

export function leftoverDiscovered(state: CrawlState): { url: string; via: DiscoveredVia; depth: number | null }[] {
  return state.frontier.map((f) => ({ url: f.url, via: state.seen[f.url] ?? f.via, depth: f.depth }))
}
