import { describe, it, expect } from 'vitest'
import { fetchLightCheck } from './light-check'
import { createCrawlState, runCrawlBatch, type CrawlPageResult } from './crawler'
import { buildLinkGraph, inboundAllByUrl, toLinkGraphInput } from './link-graph'
import { buildSiteAudit, type SiteAuditPage } from './site-audit'
import { buildRuleContext } from '@/lib/diagnosis/context'
import { eeatRules } from '@/lib/diagnosis/rules/eeat'
import { contentRules } from '@/lib/diagnosis/rules/content'
import type { RuleHitDraft } from '@/lib/diagnosis/types'

// 端到端（spec S4 Task 5）：假博客站 HTML → 真实 light-check（含文章信号）→ 爬虫 → 图谱 → site_audit → 证据 JSON 往返 → 规则。
// 5 篇文章：缺作者 3 篇、无数据支撑 3 篇；缺「联系我们」页；页脚链接 LinkedIn 主页，但 schema sameAs 声明的是 YouTube。

const H = 'https://acme.example'
// 文章判定门槛要求正文 ≥ 300 字（第三轮独立审查 P0-2），补足长度；不含数字与链接，不影响数据/引用信号。
const FILLER = '这是一段用于凑足正文长度的中文内容。'.repeat(20)
const shell = (main: string, head = '') =>
  `<html><head>${head}</head><body><header><nav><a href="/">首页</a><a href="/blog">博客</a><a href="/about">关于我们</a><a href="/privacy">隐私政策</a><a href="/terms">服务条款</a></nav></header><main>${main}</main><footer><a href="https://www.linkedin.com/company/acme">LinkedIn</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">分享</a></footer></body></html>`
const post = (opts: { author?: string; authorUrl?: string; date?: string; body: string }) =>
  shell(
    `<article>${opts.date ? `<time datetime="${opts.date}">${opts.date}</time>` : ''}${opts.author ? `<div class="byline">${opts.authorUrl ? `<a href="${opts.authorUrl}">${opts.author}</a>` : opts.author}</div>` : ''}${opts.body}<p>${FILLER}</p></article>`,
    '<meta property="og:type" content="article">',
  )

const SITE: Record<string, string> = {
  [`${H}/`]: shell('<p>欢迎</p>'),
  [`${H}/blog`]: shell(['p1', 'p2', 'p3', 'p4', 'p5'].map((p) => `<a href="/blog/${p}">文章 ${p}</a>`).join('')),
  [`${H}/about`]: shell('<p>关于</p>'),
  [`${H}/privacy`]: shell('<p>隐私</p>'),
  [`${H}/terms`]: shell('<p>条款</p>'),
  [`${H}/authors/li`]: shell('<p>作者页</p>'),
  // 完整：作者+作者页、日期、带归属数据、权威引用
  [`${H}/blog/p1`]: post({ author: '李明', authorUrl: '/authors/li', date: '2024-01-02', body: '<p>据国家统计局统计，2023年线上零售额增长 11%。</p><a href="https://www.stats.gov.cn/sj">数据</a>' }),
  // 无作者、无日期、无数据、无引用
  [`${H}/blog/p2`]: post({ body: '<p>我们觉得这个方法很好用。</p>' }),
  // 无作者、有日期、只有孤立数字、无引用
  [`${H}/blog/p3`]: post({ date: '2024-02-03', body: '<p>转化率提升了 30%，成本下降一半。</p>' }),
  // 无作者、有日期、非权威引用
  [`${H}/blog/p4`]: post({ date: '2024-03-04', body: '<p>参考了一篇文章。</p><a href="https://someblog.example/post">某博客</a>' }),
  // 有署名无作者页、有日期、孤立数字、无引用
  [`${H}/blog/p5`]: post({ author: '王芳', date: '2024-04-05', body: '<p>客户满意度达到 95%。</p>' }),
}

const fakeSafeFetch = (async (url: string) => {
  const body = SITE[url]
  const bytes = new TextEncoder().encode(body ?? '')
  return { status: body ? 200 : 404, url, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }), arrayBuffer: async () => bytes.buffer, text: async () => body ?? '' }
}) as never

describe('文章级 E-E-A-T / 数据支撑 / 社媒端到端（spec S4）', async () => {
  let state = createCrawlState(`${H}/`, [], 'acme.example')
  const results: CrawlPageResult[] = []
  while (!state.done) {
    const out = await runCrawlBatch(state, { maxPages: 200, maxDepth: 4, batchSize: 20, concurrency: 4, robotsTxt: '' }, (u, h) => fetchLightCheck(u, h, fakeSafeFetch))
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
    templates: [], citedUrls: [], entryHost: 'acme.example', maxPages: 200, maxDepth: 4, linkGraph,
  })
  const ctx = buildRuleContext({
    project: { domain: 'acme.example', industry: '', market: 'CN', language: 'zh', competitors: [] },
    evidence: [
      { id: 'sa_s4', type: 'site_audit', claimLevel: 'L4', source: `${H}/`, payload: JSON.parse(JSON.stringify(audit)), rawText: '', sitePageId: null },
      { id: 'sc_s4', type: 'schema', claimLevel: 'L4', source: `${H}/`, payload: { types: ['Organization'], sameAs: ['https://www.youtube.com/@acme'], blocks: [] }, rawText: '[]', sitePageId: null },
      { id: 'pf_s4', type: 'page_fetch', claimLevel: 'L4', source: `${H}/`, payload: {}, rawText: SITE[`${H}/`], sitePageId: null },
    ],
    probe: null,
  })
  const hit = (id: string) => [...eeatRules, ...contentRules].find((r) => r.id === id)!.evaluate(ctx) as RuleHitDraft | null

  it('5 篇文章都被识别（og:article），作者/日期/数据信号与预期一致', () => {
    const arts = results.filter((r) => r.extra.article?.isArticle).map((r) => [r.url.replace(H, ''), r.extra.article!.author, r.extra.article!.stats.attributed, r.extra.article!.citations.total])
    expect(arts.sort()).toEqual([
      ['/blog/p1', '李明', 1, 1], ['/blog/p2', null, 0, 0], ['/blog/p3', null, 0, 0], ['/blog/p4', null, 0, 1], ['/blog/p5', '王芳', 0, 0],
    ])
  })

  it('AR01（缺作者 3/5）与 AR04（无数据支撑 3/5）命中；AR02/AR03/AR05 不满足门槛不命中', () => {
    expect(hit('AR01')?.detail).toMatchObject({ articleCount: 5, missingCount: 3 })
    expect(hit('AR04')?.detail).toMatchObject({ articleCount: 5, unsupportedCount: 3 })
    expect([hit('AR02'), hit('AR03'), hit('AR05')]).toEqual([null, null, null])
  })

  it('TR06 报缺联系页；SO01 不命中（页脚有 LinkedIn，分享按钮不算）；SO02 报 sameAs 与站内不一致', () => {
    expect(hit('TR06')?.detail).toMatchObject({ missing: ['contact'] })
    expect(hit('SO01')).toBeNull()
    expect(hit('SO02')?.detail).toMatchObject({ inSchemaNotLinked: ['youtube'], linkedNotInSchema: ['linkedin'] })
  })

  it('文章页 ≥3 → C06/C07 只让出被接管的项：C06 全部让位（TR06 可运行），C07 只剩引述', () => {
    expect(hit('C06')).toBeNull()
    expect(hit('C07')?.detail).toMatchObject({ missing: ['quotes'], supersededBy: ['AR04', 'AR05'] })
  })
})
