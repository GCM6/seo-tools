import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
import type { SiteAuditPage, SiteAuditPayload } from '@/lib/crawl/site-audit'
import { technicalRules, isLanguagePathTemplate } from './technical'

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
