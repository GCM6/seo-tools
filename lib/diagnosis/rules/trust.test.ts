import { describe, expect, it } from 'vitest'
import type { RuleContext } from '../types'
import type { SiteAuditPage, SiteAuditPayload } from '@/lib/crawl/site-audit'
import { allRules } from './index'
import { detectEcommerce, trustRules } from './trust'

const rule = (id: string) => trustRules.find((item) => item.id === id)!
const one = <T>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value)

function page(url: string, partial: Partial<SiteAuditPage> = {}): SiteAuditPage {
  return {
    url,
    discoveredVia: 'crawl',
    depth: 1,
    httpStatus: 200,
    finalUrl: url,
    canonicalUrl: url,
    metaRobots: null,
    mainTextChars: 500,
    inboundLinkCount: 2,
    checkStatus: 'checked',
    errorReason: null,
    isKeyPage: false,
    ...partial,
  }
}

function ctx(pages: SiteAuditPage[], entryHtml = ''): RuleContext {
  const payload: SiteAuditPayload = {
    protocol: { maxPages: 100, maxDepth: 5 },
    stats: { totalDiscovered: pages.length, checked: pages.length, truncated: 0, http4xx: 0, http5xx: 0, errors: 0, blockedByRobots: 0, noindex: 0, canonicalOffsite: 0, orphanPages: 0, citedPages: 0 },
    pages,
    templates: [],
    citations: [],
  }
  return {
    project: { domain: 'example.com', industry: '', market: 'US', language: 'en', competitors: [] },
    siteAudit: { id: 'sa_1', payload },
    entryPage: { id: 'ep_1', rawHtml: entryHtml, canonicalUrl: 'https://example.com/', metaRobots: null, robotsAllowed: true },
    renderChecks: [], schemas: [], probe: null, probeEvidenceId: null, robotsText: null, psiChecks: [], keywordMetrics: [], queryPageMetrics: [],
    dataforseo: { configured: false, serpByKeyword: [], keywordData: [], backlinks: [], bingIndex: null, brandSerp: null },
    confirmedCompetitors: [], keywordGaps: [], uaProbe: null, thirdParty: null, socialPresence: null,
  }
}

describe('transaction trust rules', () => {
  it('registers both rules in the diagnosis engine', () => {
    expect(allRules.map((item) => item.id)).toEqual(expect.arrayContaining(['TR04', 'TR05']))
  })

  it('does not mistake a B2B product catalogue for ecommerce', () => {
    const context = ctx(
      [page('https://example.com/products/valve-a'), page('https://example.com/contact')],
      '<a href="/contact">Request a quote</a>',
    )
    expect(detectEcommerce(context)).toEqual({ isEcommerce: false, signals: ['product_path'] })
    expect(rule('TR04').evaluate(context)).toBeNull()
    expect(rule('TR05').evaluate(context)).toBeNull()
  })

  it('flags missing shipping and returns pages for an ecommerce site', () => {
    const context = ctx(
      [page('https://example.com/products/widget'), page('https://example.com/cart')],
      '<a href="/products/widget">Add to cart</a>',
    )
    const shipping = one(rule('TR04').evaluate(context))
    const returns = one(rule('TR05').evaluate(context))
    expect(shipping?.title).toBe('电商站未发现配送说明页')
    expect(returns?.title).toBe('电商站未发现退货退款说明页')
    expect(shipping?.detail?.ecommerceSignals).toContain('cart_or_checkout_path')
  })

  it('passes when the ecommerce site has both reachable policy pages', () => {
    const context = ctx(
      [
        page('https://example.com/products/widget'),
        page('https://example.com/checkout'),
        page('https://example.com/policies/shipping-policy'),
        page('https://example.com/policies/return-policy'),
      ],
      '<button>Add to cart</button>',
    )
    expect(rule('TR04').evaluate(context)).toBeNull()
    expect(rule('TR05').evaluate(context)).toBeNull()
  })

  it('does not count an unavailable policy URL as a policy page', () => {
    const context = ctx([
      page('https://example.com/product/widget'),
      page('https://example.com/cart'),
      page('https://example.com/shipping', { httpStatus: 404 }),
      page('https://example.com/returns', { checkStatus: 'error', httpStatus: 0 }),
    ])
    expect(rule('TR04').evaluate(context)).not.toBeNull()
    expect(rule('TR05').evaluate(context)).not.toBeNull()
  })
})
