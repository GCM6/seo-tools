import { describe, it, expect } from 'vitest'
import { createCrawlState, runCrawlBatch, type CrawlPageResult } from './crawler'
import { emptyLightCheckExtra, type LightCheckPage } from './light-check'
import { buildLinkGraph, toLinkGraphInput } from './link-graph'
import { buildSiteAudit } from './site-audit'

// 体积预算（spec S1 §7）：Inngest 单 step 返回 ≤ 4MiB、run 状态 ≤ 32MiB（官方文档，reported）。
// 合成最坏站点：sitemap 5000 条 + 200 页 × 每页 300 个站内目标（3 条锚文本）+ 50 条站外链接。
const MiB = 1024 * 1024
const H = 'https://big.example.com'
const SPACE = 10_000

function rng(seed: number) {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    return x / 0x7fffffff
  }
}

function fakePage(url: string): LightCheckPage {
  const rand = rng(url.length * 7919 + url.charCodeAt(url.length - 1))
  const targets = new Set<string>()
  while (targets.size < 300) targets.add(`${H}/p/${Math.floor(rand() * SPACE)}-some-product-slug`)
  const linkDetails = [...targets].map((t, i) => ({
    url: t,
    count: 1 + (i % 3),
    anchors: ['Industrial widget model XY-200 overview', 'Buy the widget now', `Spec sheet ${i}`],
    regions: i % 2 ? (['nav', 'footer'] as const).slice() : (['main'] as const).slice(),
    nofollow: false,
  }))
  const externalLinks = Array.from({ length: 50 }, (_, i) => ({
    url: `https://partner${i}.example.org/reference/page`, host: `partner${i}.example.org`,
    anchor: 'Reference source', region: 'main' as const, rel: [],
  }))
  return {
    url, finalUrl: url, httpStatus: 200, title: 'T', canonicalUrl: null, metaRobots: null, mainTextChars: 5000,
    contentHash: 'h'.repeat(64), internalLinks: linkDetails.map((d) => d.url), linkDetails, externalLinks,
    extra: emptyLightCheckExtra(true, false), checkStatus: 'checked', errorReason: null,
  }
}

describe('S1 体积预算（spec S1 §7）', async () => {
  const sitemap = Array.from({ length: 5000 }, (_, i) => `${H}/sm/${i}-sitemap-declared-article-slug`)
  const opts = { maxPages: 200, maxDepth: 3, batchSize: 20, concurrency: 4, robotsTxt: '' }
  let state = createCrawlState(`${H}/`, sitemap, 'big.example.com')
  const stepBytes: number[] = []
  const all: CrawlPageResult[] = []
  while (!state.done) {
    const out = await runCrawlBatch(state, opts, async (url) => fakePage(url))
    state = out.state
    all.push(...out.results)
    // 与 collect-evidence 的 crawl-batch step 返回值同形：{ state, resultCount }。
    stepBytes.push(JSON.stringify({ state: out.state, resultCount: out.results.length }).length)
  }

  it('单个抓取 step 返回值 < 2 MiB，全部抓取 step 之和 < 16 MiB', () => {
    expect(all.length).toBe(200)
    expect(Math.max(...stepBytes)).toBeLessThan(2 * MiB)
    expect(stepBytes.reduce((a, b) => a + b, 0)).toBeLessThan(16 * MiB)
  })

  it('site_audit payload（含 linkGraph）< 8 MiB', () => {
    const linkGraph = buildLinkGraph({
      entryUrl: `${H}/`,
      pages: all.map((r) => toLinkGraphInput(r)),
    })
    const payload = buildSiteAudit({
      pages: all.map((r) => ({
        url: r.url, discoveredVia: r.discoveredVia, depth: r.depth, httpStatus: r.httpStatus, finalUrl: r.finalUrl,
        canonicalUrl: r.canonicalUrl, metaRobots: r.metaRobots, mainTextChars: r.mainTextChars, inboundLinkCount: 0,
        internalLinks: r.internalLinks, checkStatus: r.checkStatus, errorReason: r.errorReason, isKeyPage: false,
        lightCheckExtra: r.extra,
      })),
      templates: [], citedUrls: [], entryHost: 'big.example.com', maxPages: 200, maxDepth: 3, linkGraph,
    })
    const bytes = JSON.stringify(payload).length
    console.info(`[S1 size] crawl steps=${stepBytes.length} max=${(Math.max(...stepBytes) / MiB).toFixed(2)}MiB sum=${(stepBytes.reduce((a, b) => a + b, 0) / MiB).toFixed(2)}MiB site_audit=${(bytes / MiB).toFixed(2)}MiB`)
    expect(bytes).toBeLessThan(8 * MiB)
  })
})
