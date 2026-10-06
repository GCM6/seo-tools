import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
import type { SiteAuditPage, SiteAuditPayload } from '@/lib/crawl/site-audit'
import type { ExternalCheckResult } from '@/lib/crawl/external-check'
import type { InternalLinkDetail, ExternalLinkDetail } from '@/lib/crawl/light-check'
import { buildLinkGraph, type LinkGraphPageInput } from '@/lib/crawl/link-graph'
import { linkRules } from './links'

const H = 'https://example.com'
const rule = (id: string) => linkRules.find((r) => r.id === id)!

type Spec = {
  links?: (string | { to: string; nofollow?: boolean; regions?: InternalLinkDetail['regions'] })[]
  status?: number
  via?: string
  metaRobots?: string | null
  finalUrl?: string | null
  external?: ExternalLinkDetail[]
  checkStatus?: string
  errorReason?: string
}

function ctxFor(pages: Record<string, Spec>, externalChecks?: ExternalCheckResult[]): RuleContext {
  const graphPages: LinkGraphPageInput[] = []
  const auditPages: SiteAuditPage[] = []
  for (const [path, s] of Object.entries(pages)) {
    const url = `${H}${path}`
    graphPages.push({
      url, finalUrl: s.finalUrl ?? null, checkStatus: s.checkStatus ?? 'checked', httpStatus: s.status ?? 200, metaRobots: s.metaRobots ?? null, discoveredVia: s.via ?? 'crawl',
      linkDetails: (s.links ?? []).map((l) => {
        const o = typeof l === 'string' ? { to: l } : l
        return { url: `${H}${o.to}`, count: 1, anchors: [o.to], regions: o.regions ?? ['main'], nofollow: o.nofollow ?? false }
      }),
      externalLinks: s.external ?? [],
    })
    auditPages.push({
      url, discoveredVia: s.via ?? 'crawl', depth: null, httpStatus: s.status ?? 200, finalUrl: s.finalUrl ?? null,
      canonicalUrl: null, metaRobots: s.metaRobots ?? null, mainTextChars: 100, inboundLinkCount: 0,
      checkStatus: s.checkStatus ?? 'checked', errorReason: s.errorReason ?? null, isKeyPage: false,
    })
  }
  const payload = {
    protocol: { maxPages: 200, maxDepth: 3 },
    stats: { totalDiscovered: 0, checked: 0, truncated: 0, http4xx: 0, http5xx: 0, errors: 0, blockedByRobots: 0, noindex: 0, canonicalOffsite: 0, orphanPages: 0, citedPages: 0 },
    pages: auditPages, templates: [], citations: [],
    linkGraph: buildLinkGraph({ entryUrl: `${H}/`, pages: graphPages }),
    ...(externalChecks ? { externalChecks } : {}),
  } as SiteAuditPayload
  return { siteAudit: { id: 'sa1', payload } } as unknown as RuleContext
}

describe('L01 站内断链（spec S2 §3）', () => {
  it('正文来源 → warning；带来源页与锚文本样例', () => {
    const hit = rule('L01').evaluate(ctxFor({ '/': { via: 'entry', links: ['/gone', '/a'] }, '/a': { links: ['/'] }, '/gone': { status: 404 } })) as RuleHitDraft
    expect(hit.severity).toBe('warning')
    expect(hit.evidenceRefs).toEqual(['sa1'])
    expect(hit.detail).toMatchObject({ brokenTargets: 1, brokenLinks: 1, sitewide: false, examples: [{ url: `${H}/gone`, httpStatus: 404, sourceCount: 1, sources: [{ from: `${H}/`, anchor: '/gone', regions: ['main'] }] }] })
  })
  it('导航/页脚里的全站断链 → error', () => {
    const hit = rule('L01').evaluate(ctxFor({ '/': { via: 'entry', links: [{ to: '/gone', regions: ['footer'] }, '/a'] }, '/a': { links: ['/'] }, '/gone': { status: 410 } })) as RuleHitDraft
    expect(hit.severity).toBe('error')
  })
  it('无断链 → null；无图谱 → null', () => {
    expect(rule('L01').evaluate(ctxFor({ '/': { via: 'entry', links: ['/a'] }, '/a': {} }))).toBeNull()
    expect(rule('L01').evaluate({ siteAudit: null } as unknown as RuleContext)).toBeNull()
  })
})

describe('L02–L06', () => {
  const base: Record<string, Spec> = {
    '/': { via: 'entry', links: ['/moved', '/ni', '/a', { to: '/nf', nofollow: true }] },
    '/a': { links: ['/'] },
    '/moved': { finalUrl: `${H}/a`, links: ['/'] },
    '/ni': { metaRobots: 'noindex', links: ['/'] },
    '/nf': { links: ['/'] },
    '/x': { via: 'sitemap', links: ['/y'] },
    '/y': { via: 'sitemap', links: ['/x'] },
    '/dead': { links: [] },
  }
  base['/a'] = { links: ['/', '/dead'] }

  it('L02 指向跳转', () => {
    const hit = rule('L02').evaluate(ctxFor(base)) as RuleHitDraft
    expect(hit.detail).toMatchObject({ count: 1, examples: [{ url: `${H}/moved`, finalUrl: `${H}/a` }] })
  })
  it('L03 指向 noindex', () => {
    const hit = rule('L03').evaluate(ctxFor(base)) as RuleHitDraft
    expect(hit.detail).toMatchObject({ count: 1, examples: [{ url: `${H}/ni`, reason: 'noindex' }] })
  })
  it('L04 孤岛群：抓取覆盖完整 → 默认实测', () => {
    const hit = rule('L04').evaluate(ctxFor(base)) as RuleHitDraft
    expect(hit.detail).toMatchObject({ count: 2, exact: true, examples: [`${H}/x`, `${H}/y`] })
    expect(hit.claimType).toBeUndefined()
  })
  it('L04 非精确 → inferred', () => {
    const hit = rule('L04').evaluate(ctxFor({ ...base, '/': { via: 'entry', links: ['/a', '/err'] }, '/err': { status: 0, checkStatus: 'error' } })) as RuleHitDraft
    expect(hit.claimType).toBe('inferred')
    expect(hit.description).toContain('在已抓取范围内')
  })
  it('L05 仅经 nofollow 可达，样例带引入它的 nofollow 边', () => {
    const hit = rule('L05').evaluate(ctxFor(base)) as RuleHitDraft
    expect(hit.detail).toMatchObject({ count: 1, exact: true, examples: [{ url: `${H}/nf`, via: [{ from: `${H}/`, anchor: '/nf' }] }] })
  })
  it('L06 死胡同', () => {
    const hit = rule('L06').evaluate(ctxFor(base)) as RuleHitDraft
    expect(hit.detail).toMatchObject({ count: 1, examples: [`${H}/dead`] })
  })
})

describe('L07 站外链接失效', () => {
  const pages: Record<string, Spec> = {
    '/': { via: 'entry', links: ['/a'], external: [{ url: 'https://gone.com/p', host: 'gone.com', anchor: '来源', region: 'main', rel: [] }] },
    '/a': { links: ['/'] },
  }
  it('404 → 命中；其他错误只计 unverified', () => {
    const hit = rule('L07').evaluate(ctxFor(pages, [
      { url: 'https://gone.com/p', status: 404, error: null },
      { url: 'https://slow.com/p', status: null, error: 'timeout' },
    ])) as RuleHitDraft
    expect(hit.detail).toMatchObject({ count: 1, unverified: 1, examples: [{ url: 'https://gone.com/p', status: 404, sources: [{ from: `${H}/`, anchor: '来源', region: 'main' }] }] })
  })
  it('无抽检结果 → null', () => {
    expect(rule('L07').evaluate(ctxFor(pages))).toBeNull()
  })
})

describe('L01 重定向循环（2026-10-03 真实站点冒烟：jac.com.cn 旧新闻 URL 302 → /error.html 自跳转）', () => {
  it('只有循环、没有 404 也命中；文案说明浏览器会报「重定向次数过多」', () => {
    const hit = rule('L01').evaluate(ctxFor({
      '/': { via: 'entry', links: ['/old', '/a'] },
      '/a': { links: ['/old'] },
      '/old': { checkStatus: 'error', status: 0, errorReason: 'too many redirects (redirect loop) fetching https://example.com/old' },
    })) as RuleHitDraft
    expect(hit.title).toContain('重定向循环')
    expect(hit.description).toContain('1 个陷入重定向循环')
    expect(hit.detail).toMatchObject({ brokenTargets: 1, brokenLinks: 2, redirectLoops: 1, examples: [{ url: `${H}/old`, httpStatus: null, reason: 'redirect_loop' }] })
  })
})
