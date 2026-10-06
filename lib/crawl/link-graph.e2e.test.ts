import { describe, it, expect } from 'vitest'
import { fetchLightCheck } from './light-check'
import { createCrawlState, runCrawlBatch, type CrawlPageResult } from './crawler'
import { buildLinkGraph, inboundAllByUrl, readLinkGraph, toLinkGraphInput } from './link-graph'
import { buildSiteAudit, type SiteAuditPage } from './site-audit'
import { buildRuleContext } from '@/lib/diagnosis/context'
import { technicalRules } from '@/lib/diagnosis/rules/technical'
import { linkRules } from '@/lib/diagnosis/rules/links'
import type { RuleHitDraft } from '@/lib/diagnosis/types'

// 端到端（spec S1 §10-5，陷阱 trap-rule-fixture-unreachable 的捕获检查）：
// 假站点 HTML → 真实 light-check 解析 → 真实爬虫 → 真实图谱 / site_audit → 证据 JSON 往返 → 真实规则。
// 复现并锁住 D1（sitemap 页深度恒 null）、D2（T12 默认永不触发）、D3（互链孤岛漏检）。

const H = 'https://ex.com'
// 每页带一段正文：死胡同判定（L06）只统计有正文的页。
const html = (links: string) => `<html><body><main><p>这是一段用于测试的正文内容。</p>${links}</main></body></html>`
const a = (href: string, rel = '') => `<a href="${href}"${rel ? ` rel="${rel}"` : ''}>${href}</a>`

// 入口 / 跳转到 /en/（Review Focus 3）；/en/ 的出链是入口节点的出链。
const SITE: Record<string, { status: number; finalUrl?: string; body: string }> = {
  [`${H}/`]: { status: 200, finalUrl: `${H}/en/`, body: html(a('/a') + a('/nf', 'nofollow') + a('/broken') + a('/moved')) },
  [`${H}/a`]: { status: 200, body: html(a('/b') + a('https://gone.example.org/ref')) },
  // /moved 301 → /a（S2 L02）
  [`${H}/moved`]: { status: 200, finalUrl: `${H}/a`, body: html(a('/b') + a('https://gone.example.org/ref')) },
  [`${H}/b`]: { status: 200, body: html(a('/c')) },
  [`${H}/c`]: { status: 200, body: html(a('/d')) },
  [`${H}/d`]: { status: 200, body: html(a('/e')) },
  [`${H}/e`]: { status: 200, body: html('') },
  [`${H}/nf`]: { status: 200, body: html('') },
  [`${H}/broken`]: { status: 404, body: 'not found' },
  [`${H}/x`]: { status: 200, body: html(a('/y')) },
  [`${H}/y`]: { status: 200, body: html(a('/x')) },
  [`${H}/lonely`]: { status: 200, body: html('') },
}
const SITEMAP = ['/a', '/b', '/c', '/d', '/e', '/x', '/y', '/lonely'].map((p) => `${H}${p}`)

const fakeSafeFetch = (async (url: string) => {
  const page = SITE[url] ?? { status: 404, body: '' }
  return {
    status: page.status,
    url: page.finalUrl ?? url,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: async () => page.body,
    arrayBuffer: async () => new TextEncoder().encode(page.body).buffer,
  }
}) as never

async function crawlSite(sitemap: string[] = SITEMAP): Promise<CrawlPageResult[]> {
  const opts = { maxPages: 200, maxDepth: 3, batchSize: 20, concurrency: 4, robotsTxt: '' }
  let state = createCrawlState(`${H}/`, sitemap, 'ex.com')
  const results: CrawlPageResult[] = []
  while (!state.done) {
    const out = await runCrawlBatch(state, opts, (url, host) => fetchLightCheck(url, host, fakeSafeFetch))
    state = out.state
    results.push(...out.results)
  }
  return results
}

describe('链接图谱端到端（spec S1）', async () => {
  const results = await crawlSite()
  const graphPayload = buildLinkGraph({
    entryUrl: `${H}/`,
    pages: results.map((r) => toLinkGraphInput(r)),
  })
  const inbound = inboundAllByUrl(graphPayload)
  const audit = buildSiteAudit({
    pages: results.map((r): SiteAuditPage => ({
      url: r.url, discoveredVia: r.discoveredVia, depth: r.depth, httpStatus: r.httpStatus, finalUrl: r.finalUrl,
      canonicalUrl: r.canonicalUrl, metaRobots: r.metaRobots, mainTextChars: r.mainTextChars,
      inboundLinkCount: inbound[r.url] ?? 0, internalLinks: r.internalLinks, checkStatus: r.checkStatus,
      errorReason: r.errorReason, isKeyPage: false,
    })),
    templates: [], citedUrls: [], entryHost: 'ex.com', maxPages: 200, maxDepth: 3,
    linkGraph: graphPayload, crawlStrategy: 'link_first_v1', sitemapReserveRatio: 0.2,
    externalChecks: [{ url: 'https://gone.example.org/ref', status: 404, error: null }],
  })
  // 证据经 JSON 落库再读回（libSQL json 列）。
  const stored = JSON.parse(JSON.stringify(audit))
  const ctx = buildRuleContext({
    project: { domain: 'ex.com', industry: '', market: 'US', language: 'en', competitors: [] },
    evidence: [{ id: 'sa_e2e', type: 'site_audit', claimLevel: 'L4', source: `${H}/`, payload: stored, rawText: '', sitePageId: null }],
    probe: null,
  })
  const graph = readLinkGraph(stored)!
  const depthOf = (p: string) => graph.nodeByUrl.get(`${H}${p}`)?.depth
  const rule = (id: string) => technicalRules.find((r) => r.id === id)!

  it('每个 URL 只抓一次，站点全部抓完（抓取穷尽、闭包完整）', () => {
    const urls = results.map((r) => r.url)
    expect(new Set(urls).size).toBe(urls.length)
    expect(graph.exhaustive).toBe(true)
    expect(graph.closureComplete).toBe(true)
  })

  it('D1：sitemap 页有真实点击深度；入口跳转不影响深度（Review Focus 3）', () => {
    expect([graph.entryUrl, graph.entryRequestedUrl]).toEqual([`${H}/en`, `${H}/`])
    expect([depthOf('/a'), depthOf('/b'), depthOf('/c')]).toEqual([1, 2, 3])
    expect(stored.pages.find((p: SiteAuditPage) => p.url === `${H}/b`).depth).toBe(2)
  })

  it('D2：超过 maxDepth 的页有精确深度，T12 真实触发', () => {
    expect([depthOf('/d'), depthOf('/e')]).toEqual([4, 5])
    const hit = rule('T12').evaluate(ctx) as RuleHitDraft
    expect(hit.claimType).toBeUndefined() // /d、/e 经 sitemap 预留被抓到，是已抓 HTML 页 → 实测
    expect((hit.detail as { examples: { url: string }[] }).examples.map((e) => e.url).sort()).toEqual([`${H}/d`, `${H}/e`])
  })

  it('D3：互链孤岛对首页不可达（计入 unreachableSitemapNodes），各有 1 条入链', () => {
    expect([depthOf('/x'), depthOf('/y'), depthOf('/lonely')]).toEqual([null, null, null])
    expect(graph.summary.unreachableSitemapNodes).toBe(3)
    expect(graph.nodeByUrl.get(`${H}/x`)?.inAll).toBe(1)
  })

  it('T05 只命中零入链的 sitemap 页，抓取穷尽 → 保持实测', () => {
    const hit = rule('T05').evaluate(ctx) as RuleHitDraft
    expect((hit.detail as { examples: string[] }).examples).toEqual([`${H}/lonely`])
    expect(hit.claimType).toBeUndefined()
  })

  it('S2：L01–L07 在真实采集链路上触发（spec S2 Task 6）', () => {
    const hits = Object.fromEntries(linkRules.map((r) => [r.id, r.evaluate(ctx) as RuleHitDraft | null]))
    expect((hits.L01!.detail as { examples: { url: string }[] }).examples.map((e) => e.url)).toEqual([`${H}/broken`])
    expect((hits.L02!.detail as { examples: { url: string; finalUrl: string }[] }).examples).toMatchObject([{ url: `${H}/moved`, finalUrl: `${H}/a` }])
    expect(hits.L03).toBeNull()
    expect((hits.L04!.detail as { examples: string[] }).examples).toEqual([`${H}/x`, `${H}/y`])
    expect(hits.L04!.claimType).toBeUndefined()
    expect((hits.L05!.detail as { examples: { url: string }[] }).examples.map((e) => e.url)).toEqual([`${H}/nf`])
    expect((hits.L06!.detail as { examples: string[] }).examples).toEqual([`${H}/e`, `${H}/lonely`, `${H}/nf`])
    expect((hits.L07!.detail as { examples: { url: string; sources: { from: string }[] }[] }).examples).toMatchObject([{ url: 'https://gone.example.org/ref', sources: [{ from: `${H}/a` }] }])
  })

  it('只经 nofollow 可达的页深度为 null；404 页可达且记状态码', () => {
    expect(depthOf('/nf')).toBeNull()
    expect(graph.nodeByUrl.get(`${H}/broken`)).toMatchObject({ depth: 1, httpStatus: 404, resolved: true })
  })
})

describe('链接图谱端到端：深层页不在 sitemap（纯 D2 场景）', async () => {
  const results = await crawlSite(SITEMAP.filter((u) => !u.endsWith('/d') && !u.endsWith('/e')))
  const graphPayload = buildLinkGraph({
    entryUrl: `${H}/`,
    pages: results.map((r) => toLinkGraphInput(r)),
  })
  const graph = readLinkGraph({ linkGraph: graphPayload })!
  const audit = buildSiteAudit({
    pages: results.map((r): SiteAuditPage => ({
      url: r.url, discoveredVia: r.discoveredVia, depth: r.depth, httpStatus: r.httpStatus, finalUrl: r.finalUrl,
      canonicalUrl: r.canonicalUrl, metaRobots: r.metaRobots, mainTextChars: r.mainTextChars,
      inboundLinkCount: 0, internalLinks: r.internalLinks, checkStatus: r.checkStatus, errorReason: r.errorReason, isKeyPage: false,
    })),
    templates: [], citedUrls: [], entryHost: 'ex.com', maxPages: 200, maxDepth: 3, linkGraph: graphPayload,
  })
  const ctx = buildRuleContext({
    project: { domain: 'ex.com', industry: '', market: 'US', language: 'en', competitors: [] },
    evidence: [{ id: 'sa_e2e2', type: 'site_audit', claimLevel: 'L4', source: `${H}/`, payload: JSON.parse(JSON.stringify(audit)), rawText: '', sitePageId: null }],
    probe: null,
  })

  it('第 4 层页未抓（受 maxDepth 约束）但作为已发现节点有精确深度；更深的页未被发现', () => {
    expect(results.map((r) => r.url)).not.toContain(`${H}/d`)
    expect(graph.nodeByUrl.get(`${H}/d`)).toMatchObject({ depth: 4, fetched: false, depthExact: true })
    expect(graph.nodeByUrl.has(`${H}/e`)).toBe(false)
    expect(graph.exactDepthHorizon).toBe(4)
    expect(graph.exhaustive).toBe(false)
  })

  it('T12 仍然触发，但目标未抓取、类型未确认 → 只能标推断（旧逻辑此场景永不触发）', () => {
    const hit = technicalRules.find((r) => r.id === 'T12')!.evaluate(ctx) as RuleHitDraft
    expect(hit.claimType).toBe('inferred')
    expect(hit.detail).toMatchObject({ measuredPageCount: 0, unfetchedDeepCount: 1, examples: [{ url: `${H}/d`, depth: 4, fetched: false }] })
  })
})

