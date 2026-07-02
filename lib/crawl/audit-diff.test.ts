import { describe, it, expect } from 'vitest'
import { diffSiteAudits } from './audit-diff'
import type { SiteAuditPayload } from './site-audit'

const audit = (over: Partial<SiteAuditPayload['stats']>, templates: string[] = ['/'], maxPages = 200): SiteAuditPayload => ({
  protocol: { maxPages, maxDepth: 3 },
  stats: {
    totalDiscovered: 10, checked: 10, truncated: 0, http4xx: 0, http5xx: 0, errors: 0,
    blockedByRobots: 0, noindex: 0, canonicalOffsite: 0, orphanPages: 0, citedPages: 0, ...over,
  },
  pages: [],
  templates: templates.map((pattern) => ({ pattern, pageCount: 1, representativeUrl: null })),
  citations: [],
})

describe('diffSiteAudits', () => {
  it('输出核心指标 delta 与新增/消失模板', () => {
    const out = diffSiteAudits(audit({ http4xx: 3 }, ['/', '/p/{id}']), audit({ http4xx: 1 }, ['/', '/docs/{slug}']))
    expect(out.protocolMismatch).toBe(false)
    expect(out.metrics.find((m) => m.name === 'http4xx')).toEqual({ name: 'http4xx', baseline: 3, retest: 1, delta: -2 })
    expect(out.newTemplates).toEqual(['/docs/{slug}'])
    expect(out.removedTemplates).toEqual(['/p/{id}'])
  })

  it('爬取参数不同标记协议不一致', () => {
    expect(diffSiteAudits(audit({}), audit({}, ['/'], 500)).protocolMismatch).toBe(true)
  })
})
