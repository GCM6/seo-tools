import { describe, it, expect } from 'vitest'
import { parseLightCheckHtml } from '@/lib/crawl/light-check'
import { notChecked, type RuleContext, type RuleHitDraft } from '../types'
import type { SiteAuditPage, SiteAuditPayload } from '@/lib/crawl/site-audit'
import { technicalRules, isLanguagePathTemplate, projectHost } from './technical'
import { buildLinkGraph, type LinkGraphPageInput } from '@/lib/crawl/link-graph'

const rule = (id: string) => technicalRules.find((r) => r.id === id)!

const baseCtx = (): RuleContext => ({
  project: { domain: 'example.com', industry: '', market: 'US', language: 'en', competitors: [] },
  siteAudit: null,
  entryPage: null,
  renderChecks: [],
  schemas: [],
  probe: null,
  probeEvidenceId: null,
  robotsText: null,
  psiChecks: [],
  keywordMetrics: [],
  queryPageMetrics: [],
  dataforseo: { configured: false, serpByKeyword: [], keywordData: [], backlinks: [], bingIndex: null, brandSerp: null },
  confirmedCompetitors: [],
  keywordGaps: [],
  uaProbe: null,
  thirdParty: null,
  socialPresence: null,
})

const page = (p: Partial<SiteAuditPage>): SiteAuditPage => ({
  url: 'https://example.com/p',
  discoveredVia: 'crawl',
  depth: 1,
  httpStatus: 200,
  finalUrl: null,
  canonicalUrl: null,
  metaRobots: null,
  mainTextChars: 500,
  inboundLinkCount: 5,
  checkStatus: 'checked',
  errorReason: null,
  isKeyPage: false,
  ...p,
})

const audit = (
  stats: Partial<SiteAuditPayload['stats']>,
  pages: SiteAuditPage[] = [],
): RuleContext['siteAudit'] => ({
  id: 'sa1',
  payload: {
    protocol: { maxPages: 100, maxDepth: 3 },
    stats: {
      totalDiscovered: 0,
      checked: 0,
      truncated: 0,
      http4xx: 0,
      http5xx: 0,
      errors: 0,
      blockedByRobots: 0,
      noindex: 0,
      canonicalOffsite: 0,
      orphanPages: 0,
      citedPages: 0,
      ...stats,
    },
    pages,
    templates: [],
    citations: [],
  },
})

describe('T01 robots blocked', () => {
  it('hits when entry page blocked for Googlebot', () => {
    const ctx = baseCtx()
    ctx.entryPage = { id: 'ep1', rawHtml: '', canonicalUrl: null, metaRobots: null, robotsAllowed: false }
    const hit = rule('T01').evaluate(ctx)
    expect(hit).not.toBeNull()
    expect((hit as RuleHitDraft).evidenceRefs).toContain('ep1')
    expect((hit as RuleHitDraft).scope).toBe('site')
  })
  it('hits on site_audit blocked key pages', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ blockedByRobots: 1 }, [
      page({ url: 'https://example.com/k', checkStatus: 'blocked_by_robots', isKeyPage: true }),
    ])
    const hit = rule('T01').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toContain('sa1')
    expect(hit.detail!.blockedKeyUrls).toEqual(['https://example.com/k'])
  })
  it('null when allowed', () => {
    const ctx = baseCtx()
    ctx.entryPage = { id: 'ep1', rawHtml: '', canonicalUrl: null, metaRobots: null, robotsAllowed: true }
    expect(rule('T01').evaluate(ctx)).toBeNull()
  })
})

describe('T02 http error ratio', () => {
  it('warning between 5% and 15%', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ checked: 100, http4xx: 10 })
    const hit = rule('T02').evaluate(ctx) as RuleHitDraft
    expect(hit.severity).toBe('warning')
  })
  it('error above 15%', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ checked: 100, http4xx: 10, http5xx: 10 })
    const hit = rule('T02').evaluate(ctx) as RuleHitDraft
    expect(hit.severity).toBe('error')
  })
  it('null at or below 5%', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ checked: 100, http4xx: 5 })
    expect(rule('T02').evaluate(ctx)).toBeNull()
  })
})

describe('T03 noindex', () => {
  it('hits when noindex > 0', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ noindex: 2 }, [
      page({ url: 'https://example.com/n', metaRobots: 'noindex,follow' }),
    ])
    const hit = rule('T03').evaluate(ctx) as RuleHitDraft
    expect(hit.detail!.count).toBe(2)
    expect(hit.detail!.examples).toContain('https://example.com/n')
  })
})

describe('T04 canonical offsite', () => {
  it('hits and lists offsite examples', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ canonicalOffsite: 1 }, [
      page({ url: 'https://example.com/a', canonicalUrl: 'https://other.com/a' }),
    ])
    const hit = rule('T04').evaluate(ctx) as RuleHitDraft
    expect(hit.detail!.count).toBe(1)
    expect((hit.detail!.examples as { canonical: string }[])[0].canonical).toBe('https://other.com/a')
  })
  // 复发陷阱「域名带协议」：生产里 project.domain 是 normalizeDomain 输出的完整 URL（https://host/）。
  it('project.domain 为完整 URL 时，同站 canonical 不进样例，count 与样例数一致', () => {
    const ctx = baseCtx()
    ctx.project.domain = 'https://example.com/'
    ctx.siteAudit = audit({ canonicalOffsite: 1 }, [
      page({ url: 'https://example.com/a', canonicalUrl: 'https://example.com/a' }),
      page({ url: 'https://example.com/b', canonicalUrl: 'https://other.com/a' }),
    ])
    const hit = rule('T04').evaluate(ctx) as RuleHitDraft
    const examples = hit.detail!.examples as { url: string; canonical: string }[]
    expect(examples).toEqual([{ url: 'https://example.com/b', canonical: 'https://other.com/a' }])
    expect(hit.detail!.count).toBe(examples.length)
  })
})

describe('T05 orphan', () => {
  it('hits when orphanPages > 0', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ orphanPages: 1 }, [
      page({ url: 'https://example.com/o', discoveredVia: 'sitemap', inboundLinkCount: 0 }),
    ])
    const hit = rule('T05').evaluate(ctx) as RuleHitDraft
    expect(hit.detail!.examples).toContain('https://example.com/o')
  })
})

describe('T07 sitemap missing', () => {
  it('hits when many pages but none via sitemap', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ totalDiscovered: 5 }, [page({ discoveredVia: 'crawl' })])
    expect(rule('T07').evaluate(ctx)).not.toBeNull()
  })
  it('null when sitemap pages exist', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ totalDiscovered: 5 }, [page({ discoveredVia: 'sitemap' })])
    expect(rule('T07').evaluate(ctx)).toBeNull()
  })
})

describe('T10 render dependency', () => {
  it('hits per page under 30% initial ratio', () => {
    const ctx = baseCtx()
    ctx.renderChecks = [
      { id: 'rc1', source: 'https://example.com/a', sitePageId: null, initialChars: 100, renderedChars: 1000, delta: 900, renderedText: '' },
      { id: 'rc2', source: 'https://example.com/b', sitePageId: null, initialChars: 800, renderedChars: 1000, delta: 200, renderedText: '' },
    ]
    const hits = rule('T10').evaluate(ctx) as RuleHitDraft[]
    expect(hits).toHaveLength(1)
    expect(hits[0].evidenceRefs).toEqual(['rc1'])
    expect(hits[0].scope).toBe('https://example.com/a')
  })
  it('null when renderedChars 0', () => {
    const ctx = baseCtx()
    ctx.renderChecks = [
      { id: 'rc1', source: 'x', sitePageId: null, initialChars: 0, renderedChars: 0, delta: 0, renderedText: '' },
    ]
    expect(rule('T10').evaluate(ctx)).toBeNull()
  })
})

describe('T11 key page low inbound', () => {
  it('one hit per under-linked key page', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [
      page({ url: 'https://example.com/k1', isKeyPage: true, inboundLinkCount: 1 }),
      page({ url: 'https://example.com/k2', isKeyPage: true, inboundLinkCount: 5 }),
    ])
    const hits = rule('T11').evaluate(ctx) as RuleHitDraft[]
    expect(hits).toHaveLength(1)
    expect(hits[0].scope).toBe('https://example.com/k1')
  })
  it('没有任何重点页 → 未检查（没标记重点页，不能当成没查出问题）', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [
      page({ url: 'https://example.com/a', isKeyPage: false, inboundLinkCount: 0 }),
    ])
    expect(rule('T11').evaluate(ctx)).toEqual(notChecked('site_condition', '没有标记重点页，无法评估'))
  })
})

describe('T12 click depth too deep', () => {
  it('aggregates pages with depth > 3', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [
      page({ url: 'https://example.com/deep', depth: 4 }),
      page({ url: 'https://example.com/deeper', depth: 6 }),
      page({ url: 'https://example.com/ok', depth: 3 }),
      page({ url: 'https://example.com/shallow', depth: 1 }),
    ])
    const hit = rule('T12').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['sa1'])
    expect(hit.scope).toBe('site')
    expect(hit.detail!.count).toBe(2)
    expect((hit.detail!.examples as { url: string }[]).map((e) => e.url)).toContain(
      'https://example.com/deep',
    )
  })
  it('null when no page exceeds depth 3', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ url: 'https://example.com/ok', depth: 3 })])
    expect(rule('T12').evaluate(ctx)).toBeNull()
  })
  it('ignores pages with null depth', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ url: 'https://example.com/x', depth: null })])
    expect(rule('T12').evaluate(ctx)).toBeNull()
  })
  it('null when no site audit', () => {
    expect(rule('T12').evaluate(baseCtx())).toBeNull()
  })
})

const ext = (o: Partial<import('@/lib/crawl/light-check').LightCheckExtra> = {}) => ({
  hasViewport: true, hreflangEntries: [], imgCount: 0, imgAltMissing: 0, listCount: 1,
  tableCount: 0, avgParagraphLen: 50, h2QuestionRate: 0, isHttps: true, mixedContentCount: 0,
  redirected: false, ...o,
})

describe('T06 redirect', () => {
  it('hits when pages redirected', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ url: 'https://example.com/r', lightCheckExtra: ext({ redirected: true }) })])
    const hit = rule('T06').evaluate(ctx) as RuleHitDraft
    expect(hit.detail!.count).toBe(1)
  })
  it('null when none redirected', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ lightCheckExtra: ext() })])
    expect(rule('T06').evaluate(ctx)).toBeNull()
  })
})

describe('T08 https/mixed content', () => {
  it('hits non-https page', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ url: 'http://example.com/a', lightCheckExtra: ext({ isHttps: false }) })])
    const hit = rule('T08').evaluate(ctx) as RuleHitDraft
    expect(hit.detail!.nonHttps).toBe(1)
  })
  it('hits mixed content on https page', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ lightCheckExtra: ext({ mixedContentCount: 2 }) })])
    expect(rule('T08').evaluate(ctx)).not.toBeNull()
  })
  it('null when clean', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ lightCheckExtra: ext() })])
    expect(rule('T08').evaluate(ctx)).toBeNull()
  })
})

describe('T13 viewport', () => {
  it('hits pages without viewport', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ lightCheckExtra: ext({ hasViewport: false }) })])
    const hit = rule('T13').evaluate(ctx) as RuleHitDraft
    expect(hit.detail!.count).toBe(1)
  })
  it('null when all have viewport', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ lightCheckExtra: ext({ hasViewport: true }) })])
    expect(rule('T13').evaluate(ctx)).toBeNull()
  })
})

describe('T14 hreflang 按 BCP 47 校验（SP-A §5.2 #1，真实 HTML 经 light-check 解析）', () => {
  const hreflangPage = (links: string) =>
    page({ lightCheckExtra: parseLightCheckHtml(`<html><head>${links}</head><body></body></html>`, 'https://example.com/', 'example.com').extra as never })
  it('只有 hreflang="en" 与 x-default → 不命中（en 是合法语言码）', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [hreflangPage('<link rel="alternate" hreflang="en" href="https://example.com/"><link rel="alternate" hreflang="x-default" href="https://example.com/">')])
    expect(rule('T14').evaluate(ctx)).toBeNull()
  })
  it('uk（乌克兰语）、eu（巴斯克语）是合法语言码，不命中', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [hreflangPage('<link rel="alternate" hreflang="uk" href="https://example.com/uk/"><link rel="alternate" hreflang="eu" href="https://example.com/eu/"><link rel="alternate" hreflang="x-default" href="https://example.com/">')])
    expect(rule('T14').evaluate(ctx)).toBeNull()
  })
  it('en-uk → 命中，invalidCodes 为 en-uk，并给出改为 en-gb 的建议', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [hreflangPage('<link rel="alternate" hreflang="en-uk" href="https://example.com/uk/"><link rel="alternate" hreflang="x-default" href="https://example.com/">')])
    const hit = rule('T14').evaluate(ctx) as RuleHitDraft
    expect(hit.detail!.invalidCodes).toEqual(['en-uk'])
    expect(hit.detail!.suggestions).toEqual({ 'en-uk': 'en-gb' })
  })
})

describe('T01 只为 Googlebot 真不可抓的页面报错（最终审查 F3-1）', () => {
  it('白名单式 robots：本工具爬虫（*）被禁，但 Googlebot 放行 → 不报"Googlebot 不可抓"', () => {
    const ctx = baseCtx()
    ctx.robotsText = 'User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n'
    ctx.siteAudit = audit({ blockedByRobots: 1 }, [page({ url: 'https://example.com/k', checkStatus: 'blocked_by_robots', isKeyPage: true })])
    expect(rule('T01').evaluate(ctx)).toBeNull()
  })
  it('旧证据的入口 robotsAllowed 按 * 组算成 false，但 robots 原文对 Googlebot 放行 → 重新分析时不报（最终审查 F3-1）', () => {
    const ctx = baseCtx()
    ctx.project = { ...ctx.project, domain: 'https://example.com/' }
    ctx.robotsText = 'User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n'
    ctx.entryPage = { id: 'ep1', rawHtml: '', canonicalUrl: null, metaRobots: null, robotsAllowed: false }
    expect(rule('T01').evaluate(ctx)).toBeNull()
  })
  it('Googlebot 也被禁的重点页 → 仍报 error', () => {
    const ctx = baseCtx()
    ctx.robotsText = 'User-agent: *\nDisallow: /k\n'
    ctx.siteAudit = audit({ blockedByRobots: 1 }, [page({ url: 'https://example.com/k', checkStatus: 'blocked_by_robots', isKeyPage: true })])
    expect((rule('T01').evaluate(ctx) as RuleHitDraft).severity ?? 'error').toBe('error')
  })
})

describe('T01 禁抓分级（SP-A §5.2 #2）', () => {
  it('只有 /cart 被禁抓（非入口、非重点页）→ notice「robots.txt 禁抓了 1 个 URL」', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ blockedByRobots: 1 }, [page({ url: 'https://example.com/cart', checkStatus: 'blocked_by_robots', isKeyPage: false })])
    const hit = rule('T01').evaluate(ctx) as RuleHitDraft
    expect(hit.severity).toBe('notice')
    expect(hit.title).toBe('robots.txt 禁抓了 1 个 URL')
    expect(hit.detail).toMatchObject({ blockedCount: 1, blockedUrls: ['https://example.com/cart'] })
  })
  it('入口页被禁抓 → error，标题不变', () => {
    const ctx = baseCtx()
    ctx.entryPage = { id: 'ep1', rawHtml: '', canonicalUrl: null, metaRobots: null, robotsAllowed: false }
    const hit = rule('T01').evaluate(ctx) as RuleHitDraft
    expect(hit.severity ?? 'error').toBe('error')
    expect(hit.title).toBe('入口/关键页被 robots.txt 屏蔽（Googlebot 不可抓）')
  })
  it('重点页被禁抓 → error', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ blockedByRobots: 1 }, [page({ url: 'https://example.com/k', checkStatus: 'blocked_by_robots', isKeyPage: true })])
    expect((rule('T01').evaluate(ctx) as RuleHitDraft).severity ?? 'error').toBe('error')
  })
  it('禁抓数超过 10 条时 blockedCount 用完整数量，列表只列前 10 条', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ blockedByRobots: 12 }, Array.from({ length: 12 }, (_, i) => page({ url: `https://example.com/search?q=${i}`, checkStatus: 'blocked_by_robots', isKeyPage: false })))
    const hit = rule('T01').evaluate(ctx) as RuleHitDraft
    expect(hit.title).toBe('robots.txt 禁抓了 12 个 URL')
    expect(hit.detail!.blockedCount).toBe(12)
    expect((hit.detail!.blockedUrls as string[]).length).toBe(10)
  })
})

describe('T14 hreflang', () => {
  it('flags invalid region code and missing x-default', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ lightCheckExtra: ext({ hreflangEntries: [{ hreflang: 'en-uk', href: 'x' }] }) })])
    const hit = rule('T14').evaluate(ctx) as RuleHitDraft
    expect((hit.detail!.invalidCodes as string[])).toContain('en-uk')
    expect(hit.detail!.hasXDefault).toBe(false)
  })
  it('null for single-language site (no hreflang)', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ lightCheckExtra: ext({ hreflangEntries: [] }) })])
    expect(rule('T14').evaluate(ctx)).toBeNull()
  })
  it('null when hreflang valid with x-default', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [page({ lightCheckExtra: ext({ hreflangEntries: [{ hreflang: 'en-gb', href: 'x' }, { hreflang: 'x-default', href: 'y' }] }) })])
    expect(rule('T14').evaluate(ctx)).toBeNull()
  })
})

// —— T09a-c 性能检查组（证据源 PSI）——
import type { PsiResult } from '@/lib/collection/psi'

const psiResult = (o: { strategy?: PsiResult['strategy']; crux?: Partial<PsiResult['crux']>; lighthouse?: Partial<PsiResult['lighthouse']> } = {}): PsiResult => ({
  strategy: o.strategy ?? 'mobile',
  crux: { lcpMs: null, inpMs: null, cls: null, hasFieldData: false, ...o.crux },
  lighthouse: { performanceScore: null, opportunities: [], ttfbMs: null, ...o.lighthouse },
})

const psiCheck = (result: PsiResult, id = 'psi1'): RuleContext['psiChecks'][number] => ({
  id, source: 'https://example.com/', sitePageId: null, result,
})

describe('T09a CWV field data', () => {
  it('flags failing CWV metrics when field data present', () => {
    const ctx = baseCtx()
    ctx.psiChecks = [psiCheck(psiResult({ crux: { lcpMs: 4200, inpMs: 120, cls: 0.25, hasFieldData: true } }))]
    const hit = rule('T09a').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    const failing = hit.detail!.failing as { metric: string }[]
    expect(failing.map((f) => f.metric).sort()).toEqual(['CLS', 'LCP'])
    expect(rule('T09a').claimType).toBe('measured_hard')
  })
  it('null when all metrics pass', () => {
    const ctx = baseCtx()
    ctx.psiChecks = [psiCheck(psiResult({ crux: { lcpMs: 2000, inpMs: 150, cls: 0.05, hasFieldData: true } }))]
    expect(rule('T09a').evaluate(ctx)).toBeNull()
  })
  it('null when no field data (degrades to T09b/c)', () => {
    const ctx = baseCtx()
    ctx.psiChecks = [psiCheck(psiResult({ crux: { lcpMs: 9000, hasFieldData: false } }))]
    expect(rule('T09a').evaluate(ctx)).toBeNull()
  })
})

describe('T09b Lighthouse clues', () => {
  it('emits deduped top opportunities as inferred', () => {
    const ctx = baseCtx()
    ctx.psiChecks = [
      psiCheck(psiResult({ lighthouse: { opportunities: [{ id: 'a', title: '压缩图片', savingsMs: 800 }, { id: 'b', title: '移除阻塞资源', savingsMs: 300 }] } })),
    ]
    const hit = rule('T09b').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(rule('T09b').claimType).toBe('inferred')
    const clues = hit.detail!.clues as { title: string }[]
    expect(clues[0].title).toBe('压缩图片') // 按 savings 降序
  })
  it('null when no opportunities', () => {
    const ctx = baseCtx()
    ctx.psiChecks = [psiCheck(psiResult())]
    expect(rule('T09b').evaluate(ctx)).toBeNull()
  })
})

describe('T09c slow TTFB', () => {
  it('flags slow TTFB; measured_hard when field data present', () => {
    const ctx = baseCtx()
    ctx.psiChecks = [psiCheck(psiResult({ crux: { hasFieldData: true }, lighthouse: { ttfbMs: 1500 } }))]
    const hit = rule('T09c').evaluate(ctx) as RuleHitDraft
    expect(hit).toBeTruthy()
    expect(hit.detail!.ttfbMs).toBe(1500)
    expect(hit.claimType).toBe('measured_hard')
  })
  it('caps at inferred when no field data', () => {
    const ctx = baseCtx()
    ctx.psiChecks = [psiCheck(psiResult({ lighthouse: { ttfbMs: 1500 } }))]
    const hit = rule('T09c').evaluate(ctx) as RuleHitDraft
    expect(hit.claimType).toBe('inferred')
  })
  it('null when TTFB fast', () => {
    const ctx = baseCtx()
    ctx.psiChecks = [psiCheck(psiResult({ lighthouse: { ttfbMs: 400 } }))]
    expect(rule('T09c').evaluate(ctx)).toBeNull()
  })
})

describe('isLanguagePathTemplate', () => {
  it('识别语言首段模板', () => {
    expect(isLanguagePathTemplate('/de/{slug}')).toBe(true)
    expect(isLanguagePathTemplate('/zh-cn/products')).toBe(true)
    expect(isLanguagePathTemplate('https://example.com/fr/a')).toBe(true)
  })
  it('非语言首段返回 false', () => {
    expect(isLanguagePathTemplate('/products/{id}')).toBe(false)
    expect(isLanguagePathTemplate('/blog/{slug}')).toBe(false)
    expect(isLanguagePathTemplate('/')).toBe(false)
  })
})

describe('T15 低价值语言页泛滥', () => {
  // 造 2 种语言各 6 页共 12 页语言页，其中 11 页零展示（>10 且占比 >0.7）。
  const langPages = () => {
    const ps: ReturnType<typeof page>[] = []
    for (const lang of ['de', 'fr']) {
      for (let i = 0; i < 6; i++) ps.push(page({ url: `https://example.com/${lang}/p${i}` }))
    }
    return ps
  }
  const langTemplates = [
    { pattern: '/de/{slug}', pageCount: 6, representativeUrl: null },
    { pattern: '/fr/{slug}', pageCount: 6, representativeUrl: null },
  ]
  const withTemplates = (
    saPages: ReturnType<typeof page>[],
    templates = langTemplates,
  ): RuleContext['siteAudit'] => {
    const sa = audit({}, saPages)!
    sa.payload.templates = templates
    return sa
  }

  it('GSC 未连接时 no-op', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withTemplates(langPages())
    // queryPageMetrics 为空 => 无 GSC
    expect(rule('T15').evaluate(ctx)).toBeNull()
  })

  it('命中：2 种语言 + 零展示占比达标', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withTemplates(langPages())
    // 只有 /de/p0 有展示，其余 11 页零展示
    ctx.queryPageMetrics = [
      { evidenceId: 'gsc1', page: 'https://example.com/de/p0', query: 'x', clicks: 0, impressions: 5, position: 10 },
    ]
    const hit = rule('T15').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.evidenceRefs).toEqual(['sa1', 'gsc1'])
    expect(hit.detail!.zeroImpressionCount).toBe(11)
    expect((hit.detail!.langCodes as string[]).sort()).toEqual(['de', 'fr'])
  })

  it('单语言（<2 种）no-op', () => {
    const ctx = baseCtx()
    const ps = Array.from({ length: 12 }, (_, i) => page({ url: `https://example.com/de/p${i}` }))
    ctx.siteAudit = withTemplates(ps, [{ pattern: '/de/{slug}', pageCount: 12, representativeUrl: null }])
    ctx.queryPageMetrics = [
      { evidenceId: 'gsc1', page: 'https://example.com/de/p0', query: 'x', clicks: 0, impressions: 5, position: 10 },
    ]
    expect(rule('T15').evaluate(ctx)).toBeNull()
  })

  it('零展示未达绝对数下限 no-op', () => {
    const ctx = baseCtx()
    // 2 种语言各 2 页 = 4 页，即使全零展示也 <10
    const ps = ['de', 'fr'].flatMap((l) => [0, 1].map((i) => page({ url: `https://example.com/${l}/p${i}` })))
    ctx.siteAudit = withTemplates(ps, langTemplates)
    ctx.queryPageMetrics = [
      { evidenceId: 'gsc1', page: 'https://example.com/other', query: 'x', clicks: 0, impressions: 5, position: 10 },
    ]
    expect(rule('T15').evaluate(ctx)).toBeNull()
  })
})

// —— spec S1 §8：T12/T05 读链接图谱 ——
const GH = 'https://example.com'
const gp = (path: string, links: string[] | null, over: Partial<LinkGraphPageInput> = {}): LinkGraphPageInput => ({
  url: `${GH}${path}`, checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'crawl',
  linkDetails: links && links.map((l) => ({ url: `${GH}${l}`, count: 1, anchors: [], regions: ['main' as const], nofollow: false })),
  externalLinks: [], ...over,
})
const withGraph = (a: RuleContext['siteAudit'], pages: LinkGraphPageInput[]): RuleContext['siteAudit'] =>
  ({ ...a!, payload: { ...a!.payload, linkGraph: buildLinkGraph({ entryUrl: `${GH}/`, pages }) } })

describe('T12 读图谱深度（spec S1 §8）', () => {
  it('已抓取的 HTML 页深度精确且 > 3 → 实测', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({}), [
      gp('/', ['/1'], { discoveredVia: 'entry' }), gp('/1', ['/2']), gp('/2', ['/3']), gp('/3', ['/4']), gp('/4', []),
    ])
    const hit = rule('T12').evaluate(ctx) as RuleHitDraft
    expect(hit.detail).toMatchObject({ count: 1, measuredPageCount: 1, unfetchedDeepCount: 0, exactDepthHorizon: null, examples: [{ url: `${GH}/4`, depth: 4, fetched: true }] })
    expect(hit.claimType).toBeUndefined()
    expect(hit.description).toContain('搜索引擎可跟随链接')
  })

  it('只有未抓取的超深链接目标 → 推断（页面类型与状态未确认，审查 P4）', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({}), [
      gp('/', ['/1'], { discoveredVia: 'entry' }), gp('/1', ['/2']), gp('/2', ['/3']), gp('/3', ['/4']),
    ])
    const hit = rule('T12').evaluate(ctx) as RuleHitDraft
    expect(hit.claimType).toBe('inferred')
    expect(hit.detail).toMatchObject({ measuredPageCount: 0, unfetchedDeepCount: 1, examples: [{ url: `${GH}/4`, depth: 4, fetched: false }] })
  })

  it('图片/PDF 等资源 URL 与 404 页不算「页面」（审查复现 F）', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({}), [
      gp('/', ['/1'], { discoveredVia: 'entry' }), gp('/1', ['/2']), gp('/2', ['/3']),
      gp('/3', ['/img/p1.jpg', '/manual.pdf', '/gone']), gp('/gone', [], { httpStatus: 404 }),
    ])
    expect(rule('T12').evaluate(ctx)).toBeNull()
  })

  it('上界深度计入 upperBoundDeepCount，不进实测样例（审查 P7）', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({}), [
      gp('/', ['/1', '/x'], { discoveredVia: 'entry' }), gp('/x', [], { httpStatus: 503 }),
      gp('/1', ['/2']), gp('/2', ['/3']), gp('/3', ['/4']), gp('/4', []),
    ])
    expect(rule('T12').evaluate(ctx)).toBeNull()
  })

  it('视界不足 4（第 2 层有抓取失败）时不判定', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({}), [
      gp('/', ['/1'], { discoveredVia: 'entry' }), gp('/1', ['/2']),
      gp('/2', null, { checkStatus: 'error', httpStatus: 0 }),
    ])
    expect(rule('T12').evaluate(ctx)).toBeNull()
  })
})

describe('T05 诚信降级（spec S1 §8）', () => {
  const orphan = page({ url: `${GH}/o`, discoveredVia: 'sitemap', depth: null, inboundLinkCount: 0 })

  it('抓取未穷尽 → inferred，措辞说明已抓范围', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({ orphanPages: 1, checked: 3 }, [orphan]), [
      gp('/', ['/a'], { discoveredVia: 'entry' }), gp('/a', ['/z']), gp('/o', [], { discoveredVia: 'sitemap' }),
    ])
    const hit = rule('T05').evaluate(ctx) as RuleHitDraft
    expect(hit.claimType).toBe('inferred')
    expect(hit.description).toContain('已抓取的 3 页')
    expect(hit.detail).toMatchObject({ exhaustive: false })
  })

  it('抓取穷尽 → 保持规则默认 measured_hard', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({ orphanPages: 1, checked: 3 }, [orphan]), [
      gp('/', ['/a'], { discoveredVia: 'entry' }), gp('/a', []), gp('/o', [], { discoveredVia: 'sitemap' }),
    ])
    expect((rule('T05').evaluate(ctx) as RuleHitDraft).claimType).toBeUndefined()
  })

  it('入口页零站内出链（疑似 JS 渲染导航）→ 不判定（Review Focus 1）', () => {
    const ctx = baseCtx()
    ctx.siteAudit = withGraph(audit({ orphanPages: 1, checked: 2 }, [orphan]), [
      gp('/', [], { discoveredVia: 'entry' }), gp('/o', [], { discoveredVia: 'sitemap' }),
    ])
    expect(rule('T05').evaluate(ctx)).toEqual(notChecked('site_condition', '入口页没有可抓取的站内链接，孤岛判定不可信'))
  })
})

describe('口径与 L01/L03 对齐（第二轮独立审查 #16）', () => {
  it('T02：401/403/429 等拒绝访问码不计入错误比例（多为反爬/限流），单列在 detail', () => {
    const ctx = baseCtx()
    const pages = [
      page({ url: `${GH}/a`, httpStatus: 403 }), page({ url: `${GH}/b`, httpStatus: 403 }),
      page({ url: `${GH}/c`, httpStatus: 429 }), page({ url: `${GH}/d`, httpStatus: 404 }),
    ]
    ctx.siteAudit = audit({ checked: 30, http4xx: 4 }, pages)
    // 扣掉 3 个拒绝访问码后只剩 1/30（3.3%），不超 5% 告警线
    expect(rule('T02').evaluate(ctx)).toBeNull()
    ctx.siteAudit = audit({ checked: 10, http4xx: 4 }, pages)
    const hit = rule('T02').evaluate(ctx) as RuleHitDraft
    expect(hit.detail).toMatchObject({ denied: 3, examples: [{ url: `${GH}/d`, status: 404 }] })
  })

  it('T03：隐私/条款/登录等功能页的 noindex 是正常做法，不计入「误用」', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ noindex: 2 }, [
      page({ url: `${GH}/privacy-policy`, metaRobots: 'noindex' }), page({ url: `${GH}/login`, metaRobots: 'noindex' }),
    ])
    expect(rule('T03').evaluate(ctx)).toBeNull()
    ctx.siteAudit = audit({ noindex: 2 }, [
      page({ url: `${GH}/privacy-policy`, metaRobots: 'noindex' }), page({ url: `${GH}/guide`, metaRobots: 'noindex' }),
    ])
    expect((rule('T03').evaluate(ctx) as RuleHitDraft).detail).toMatchObject({ count: 1, examples: [`${GH}/guide`] })
  })
})


describe('真实站点冒烟修复（2026-10-03）', () => {
  it('T07：链接优先爬取下 sitemap 页多半先被链接发现（discoveredVia=both），仍算来自 sitemap（metadocu.com 误报）', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({ totalDiscovered: 5 }, [page({ discoveredVia: 'both' })])
    expect(rule('T07').evaluate(ctx)).toBeNull()
  })
  it('逐页内容规则只看 2xx HTML 页：PDF 与 429 限流页不算缺 viewport；历史证据无 contentKind 仍按 HTML 计（jac/ruanyifeng 误报）', () => {
    const ctx = baseCtx()
    ctx.siteAudit = audit({}, [
      page({ url: 'https://example.com/a.pdf', lightCheckExtra: ext({ hasViewport: false, contentKind: 'document' }) }),
      page({ url: 'https://example.com/limited', httpStatus: 429, lightCheckExtra: ext({ hasViewport: false, contentKind: 'html' }) }),
      page({ url: 'https://example.com/old', lightCheckExtra: ext({ hasViewport: false }) }),
    ])
    expect((rule('T13').evaluate(ctx) as RuleHitDraft).detail).toMatchObject({ count: 1, examples: ['https://example.com/old'] })
  })
})

describe('projectHost / T04 本站域名（复发陷阱：域名带协议）', () => {
  it('兼容 normalizeDomain 输出的完整 URL 与裸域名', () => {
    expect(projectHost('https://metadocu.com/')).toBe('metadocu.com')
    expect(projectHost('https://www.metadocu.com/')).toBe('metadocu.com')
    expect(projectHost('metadocu.com')).toBe('metadocu.com')
  })
})
