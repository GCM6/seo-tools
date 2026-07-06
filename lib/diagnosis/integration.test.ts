import { describe, it, expect } from 'vitest'
import { buildRuleContext } from './context'
import { evaluateRules } from './engine'
import { allRules } from './rules'
import { generateRecommendation } from './recommend'
import { severityToFinding, type DiagnosisEvidenceRow } from './types'
import type { SiteAuditPayload } from '@/lib/crawl/site-audit'

// 端到端集成：真实模块（规则集 + 引擎 + 建议生成器，无 fake）跑一份贴近生产的证据，
// 证明「采集证据 → findings → recommendations」这条链真能出数据，且每条 finding 满足
// DB 硬约束（evidenceRefs 非空、severity ∈ high|mid|ok、measured_hard 有 L4 证据锚）。

function siteAuditPayload(): SiteAuditPayload {
  return {
    protocol: { maxPages: 200, maxDepth: 3 },
    stats: {
      totalDiscovered: 22,
      checked: 20,
      truncated: 0,
      http4xx: 3,
      http5xx: 1, // (3+1)/20 = 20% → T02 error
      errors: 0,
      blockedByRobots: 0,
      noindex: 2, // T03
      canonicalOffsite: 1, // T04
      orphanPages: 2, // T05
      citedPages: 0,
    },
    pages: [
      {
        url: 'https://example.com/pricing',
        discoveredVia: 'crawl',
        depth: 1,
        httpStatus: 200,
        finalUrl: null,
        canonicalUrl: 'https://example.com/pricing',
        metaRobots: null,
        mainTextChars: 800,
        inboundLinkCount: 1, // 重点页内链不足 → T11
        checkStatus: 'checked',
        errorReason: null,
        isKeyPage: true,
      },
    ],
    templates: [{ pattern: '/blog/*', pageCount: 12, representativeUrl: 'https://example.com/blog/a' }],
    citations: [],
  }
}

function evidence(): DiagnosisEvidenceRow[] {
  return [
    {
      id: 'ev_audit',
      type: 'site_audit',
      claimLevel: 'L4',
      source: 'https://example.com',
      payload: siteAuditPayload(),
      rawText: '{}',
      sitePageId: null,
    },
    {
      id: 'ev_entry',
      type: 'page_fetch',
      claimLevel: 'L4',
      source: 'https://example.com',
      // 无 title / 无 meta description / 无 h1 → C01 / C02 / C03
      payload: { canonicalUrl: 'https://example.com', metaRobots: null, robotsAllowed: true },
      rawText: '<html><body><p>hello world</p></body></html>',
      sitePageId: null,
    },
    {
      id: 'ev_render',
      type: 'render_check',
      claimLevel: 'L4',
      source: 'https://example.com',
      // 初始正文远小于渲染后 → 渲染依赖 T10 / G03
      payload: { initialHtmlMainTextChars: 100, renderedMainTextChars: 1000, mainContentDelta: 900 },
      rawText: '<html></html>',
      sitePageId: null,
    },
    {
      id: 'ev_schema',
      type: 'schema',
      claimLevel: 'L4',
      source: 'https://example.com',
      // 仅 WebSite，缺推荐类型 → C05a
      payload: { types: ['WebSite'] },
      rawText: '[]',
      sitePageId: null,
    },
  ]
}

describe('diagnosis engine — real end-to-end', () => {
  const ctx = buildRuleContext({
    project: { domain: 'example.com', industry: 'saas', market: 'us', language: 'en', competitors: [] },
    evidence: evidence(),
    probe: null,
  })
  const hits = evaluateRules(ctx, allRules)

  it('produces a non-empty finding set from realistic evidence', () => {
    expect(hits.length).toBeGreaterThan(0)
    const ids = new Set(hits.map((h) => h.ruleId))
    // 核心期望：技术断裂 + 内容缺失 + 渲染依赖都被规则集捕获
    for (const expected of ['T02', 'T04', 'T05', 'T10', 'C01', 'G03']) {
      expect(ids, `expected rule ${expected} to fire`).toContain(expected)
    }
  })

  it('every finding satisfies DB invariants (evidenceRefs non-empty, severity mapped)', () => {
    for (const hit of hits) {
      expect(hit.evidenceRefs.length, `${hit.ruleId} evidenceRefs`).toBeGreaterThan(0)
      expect(['high', 'mid', 'ok']).toContain(severityToFinding(hit.severity))
      expect(hit.title.length).toBeGreaterThan(0)
      // fingerprint 稳定且各命中唯一（跨 run 对齐锚）
      expect(hit.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    }
    const fps = hits.map((h) => h.fingerprint)
    expect(new Set(fps).size).toBe(fps.length)
  })

  it('T02 escalates to error at 20% error-page ratio', () => {
    const t02 = hits.find((h) => h.ruleId === 'T02')
    expect(t02?.severity).toBe('error')
    expect(severityToFinding(t02!.severity)).toBe('high')
  })

  it('generates an insert-ready recommendation for every finding', () => {
    const quadrants = new Set(['quick_win', 'strategic', 'fill_in', 'low'])
    for (const hit of hits) {
      const rec = generateRecommendation(hit, { domain: 'example.com' })
      expect(rec.what.length, `${hit.ruleId} what`).toBeGreaterThan(0)
      expect(quadrants, `${hit.ruleId} priority`).toContain(rec.priority)
      expect(rec.evidenceRefs.length).toBeGreaterThan(0)
      expect(['content', 'technical', 'brief', 'cms']).toContain(rec.promptType)
    }
  })

  it('C05a never recommends adding FAQ/HowTo for rich results (official 2026-05 correction)', () => {
    const c05a = hits.find((h) => h.ruleId === 'C05a')
    if (c05a) {
      const rec = generateRecommendation(c05a)
      // FAQ/HowTo 只能出现在否定语境（不要为富摘要而新增）——若提到 FAQ，必须同句带否定词。
      if (rec.what.includes('FAQ') || rec.what.includes('HowTo')) {
        expect(rec.what).toMatch(/不要|无需|不建议|不再/)
      }
    }
  })
})

// —— Phase B 端到端：真实 allRules 从真实 psi/gsc 证据 payload 触发 T09/K 组 ——
describe('diagnosis engine — Phase B PSI/GSC wiring (real allRules)', () => {
  const evidence: DiagnosisEvidenceRow[] = [
    {
      id: 'psi_e2e', type: 'psi', claimLevel: 'L4', source: 'https://example.com/', sitePageId: null, rawText: '',
      payload: { strategy: 'mobile', crux: { lcpMs: 4200, inpMs: 250, cls: 0.2, hasFieldData: true }, lighthouse: { performanceScore: 35, opportunities: [{ id: 'uses-optimized-images', title: '压缩图片', savingsMs: 900 }], ttfbMs: 1500 } },
    },
    {
      id: 'gsc_q_e2e', type: 'gsc', claimLevel: 'L4', source: 'sc-domain:example.com', sitePageId: null, rawText: '',
      payload: { dimension: 'query', rows: [
        { keys: ['buy blue widgets'], clicks: 12, impressions: 800, ctr: 0.015, position: 8 }, // K01 机会词
        { keys: ['brand name'], clicks: 20, impressions: 1000, ctr: 0.03, position: 2 }, // K02 低 CTR（bench 0.15）
      ] },
    },
    {
      id: 'gsc_p_e2e', type: 'gsc', claimLevel: 'L4', source: 'sc-domain:example.com', sitePageId: null, rawText: '',
      payload: { dimension: 'queryPage', rows: [
        { keys: ['https://example.com/a', 'widgets'], clicks: 5, impressions: 200, position: 4 },
        { keys: ['https://example.com/b', 'widgets'], clicks: 2, impressions: 120, position: 9 }, // K06 蚕食
      ] },
    },
  ]

  const ctx = buildRuleContext({ project: { domain: 'example.com', industry: '', market: 'us', language: 'en', competitors: [] }, evidence, probe: null })
  const hits = evaluateRules(ctx, allRules)
  const ids = new Set(hits.map((h) => h.ruleId))

  it('fires T09a/T09c CWV rules and K01/K02/K06 keyword rules', () => {
    for (const expected of ['T09a', 'T09b', 'T09c', 'K01', 'K02', 'K06']) {
      expect(ids, `expected ${expected} to fire`).toContain(expected)
    }
  })

  it('K02 stays hypothesis; T09a stays measured_hard with L4 psi evidence', () => {
    const k02 = hits.find((h) => h.ruleId === 'K02')!
    expect(k02.claimType).toBe('hypothesis')
    const t09a = hits.find((h) => h.ruleId === 'T09a')!
    expect(t09a.claimType).toBe('measured_hard')
    expect(t09a.evidenceRefs).toContain('psi_e2e')
  })

  it('every Phase B finding has a non-generic recommendation', () => {
    for (const id of ['T09a', 'T09c', 'K01', 'K06']) {
      const hit = hits.find((h) => h.ruleId === id)!
      const rec = generateRecommendation(hit, { domain: 'example.com' })
      expect(rec.what.length, `${id} what`).toBeGreaterThan(0)
      expect(rec.evidenceRefs.length).toBeGreaterThan(0)
    }
  })
})
