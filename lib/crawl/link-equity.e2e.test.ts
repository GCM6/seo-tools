import { describe, it, expect } from 'vitest'
import { fetchLightCheck } from './light-check'
import { createCrawlState, runCrawlBatch, type CrawlPageResult } from './crawler'
import { buildLinkGraph, inboundAllByUrl, toLinkGraphInput } from './link-graph'
import { buildSiteAudit, type SiteAuditPage } from './site-audit'
import { buildRuleContext } from '@/lib/diagnosis/context'
import { equityRules } from '@/lib/diagnosis/rules/equity'
import type { RuleHitDraft } from '@/lib/diagnosis/types'

// 端到端（spec S3 Task 4）：假站点 HTML → 真实 light-check → 爬虫 → 图谱 → site_audit → 证据 JSON 往返 → W 规则。
// 首页导航链 12 页；/pricing 只经深层页 /guide 正文链接（/guide 还链向另外 5 页），但 GSC 点击最高 → W01 应命中。

const H = 'https://eq.example'
const nav = Array.from({ length: 12 }, (_, i) => `/n${i}`)
const navHtml = `<nav>${nav.map((n) => `<a href="${n}">导航 ${n}</a>`).join('')}</nav>`
const page = (main: string, withNav = true) =>
  `<html><body>${withNav ? navHtml : '<nav><a href="/">首页</a></nav>'}<main><p>正文内容段落。</p>${main}</main></body></html>`

const SITE: Record<string, string> = { [`${H}/`]: page('') }
for (const n of nav) SITE[`${H}${n}`] = page('', false)
SITE[`${H}/n11`] = page('<a href="/guide">选购指南</a>', false)
SITE[`${H}/guide`] = page(['<a href="/pricing">查看完整价格方案</a>', ...[1, 2, 3, 4, 5].map((i) => `<a href="/topic-${i}">专题 ${i}</a>`)].join(''), false)
SITE[`${H}/pricing`] = page('', false)
for (const i of [1, 2, 3, 4, 5]) SITE[`${H}/topic-${i}`] = page('', false)

const fakeSafeFetch = (async (url: string) => {
  const body = SITE[url]
  const bytes = new TextEncoder().encode(body ?? '')
  return { status: body ? 200 : 404, url, headers: new Headers({ 'content-type': 'text/html' }), arrayBuffer: async () => bytes.buffer, text: async () => body ?? '' }
}) as never

describe('内链权重端到端（spec S3）', async () => {
  let state = createCrawlState(`${H}/`, [], 'eq.example')
  const results: CrawlPageResult[] = []
  while (!state.done) {
    const out = await runCrawlBatch(state, { maxPages: 200, maxDepth: 5, batchSize: 20, concurrency: 4, robotsTxt: '' }, (u, h) => fetchLightCheck(u, h, fakeSafeFetch))
    state = out.state
    results.push(...out.results)
  }
  const linkGraph = buildLinkGraph({ entryUrl: `${H}/`, pages: results.map((r) => toLinkGraphInput(r)) })
  const inbound = inboundAllByUrl(linkGraph)
  const audit = buildSiteAudit({
    pages: results.map((r): SiteAuditPage => ({
      url: r.url, discoveredVia: r.discoveredVia, depth: r.depth, httpStatus: r.httpStatus, finalUrl: r.finalUrl !== r.url ? r.finalUrl : null,
      canonicalUrl: r.canonicalUrl, metaRobots: r.metaRobots, mainTextChars: r.mainTextChars, inboundLinkCount: inbound[r.url] ?? 0,
      internalLinks: r.internalLinks, checkStatus: r.checkStatus, errorReason: r.errorReason, isKeyPage: false, lightCheckExtra: r.extra,
    })),
    templates: [], citedUrls: [], entryHost: 'eq.example', maxPages: 200, maxDepth: 5, linkGraph,
  })
  const ctx = buildRuleContext({
    project: { domain: 'eq.example', industry: '', market: 'US', language: 'en', competitors: [] },
    evidence: [{ id: 'sa_eq', type: 'site_audit', claimLevel: 'L4', source: `${H}/`, payload: JSON.parse(JSON.stringify(audit)), rawText: '', sitePageId: null }],
    probe: null,
  })
  // GSC 页面数据（URL 写法带 www 与末尾斜杠，验证对齐）
  ctx.queryPageMetrics = [
    { evidenceId: 'g', page: 'https://www.eq.example/pricing/', query: 'pricing', clicks: 120, impressions: 3000, position: 6 },
    { evidenceId: 'g', page: `${H}/n3`, query: 'x', clicks: 2, impressions: 80, position: 20 },
  ]
  const rule = (id: string) => equityRules.find((r) => r.id === id)!

  it('抓到全部 20 页', () => {
    expect(results.filter((r) => r.checkStatus === 'checked').length).toBe(20)
  })

  it('W01 命中 /pricing（GSC 点击最高、站内权重垫底）', () => {
    const hit = rule('W01').evaluate(ctx) as RuleHitDraft
    const first = (hit.detail as { examples: { url: string; relative: number }[] }).examples[0]
    expect(first.url).toBe(`${H}/pricing`)
    expect(first.relative).toBeLessThan(0.5)
  })

  it('W03/W04 不命中（/pricing 入链只有 1 条，不满足 ≥3 的判定门槛）', () => {
    expect(rule('W03').evaluate(ctx)).toBeNull()
    expect(rule('W04').evaluate(ctx)).toBeNull()
  })
})
