import { describe, it, expect } from 'vitest'
import { buildRuleContext, parseGscKeywordMetrics } from './context'
import type { DiagnosisEvidenceRow, RuleContext } from './types'

const project: RuleContext['project'] = { domain: 'example.com', industry: '', market: 'US', language: 'en', competitors: [] }

const ev = (o: Partial<DiagnosisEvidenceRow> & Pick<DiagnosisEvidenceRow, 'id' | 'type'>): DiagnosisEvidenceRow => ({
  claimLevel: 'L4', source: 'https://example.com/', payload: null, rawText: '', sitePageId: null, ...o,
})

const build = (evidence: DiagnosisEvidenceRow[]) => buildRuleContext({ project, evidence, probe: null })

describe('buildRuleContext — PSI parsing', () => {
  it('maps a psi evidence row into psiChecks with normalized result', () => {
    const ctx = build([
      ev({
        id: 'psi1', type: 'psi',
        payload: { strategy: 'mobile', crux: { lcpMs: 4200, inpMs: null, cls: 0.2, hasFieldData: true }, lighthouse: { performanceScore: 40, opportunities: [], ttfbMs: 1500 } },
      }),
    ])
    expect(ctx.psiChecks).toHaveLength(1)
    expect(ctx.psiChecks[0].id).toBe('psi1')
    expect(ctx.psiChecks[0].result.crux.hasFieldData).toBe(true)
    expect(ctx.psiChecks[0].result.lighthouse.ttfbMs).toBe(1500)
  })
  it('drops malformed psi payloads (missing crux/lighthouse)', () => {
    const ctx = build([ev({ id: 'psi2', type: 'psi', payload: { strategy: 'mobile' } })])
    expect(ctx.psiChecks).toHaveLength(0)
  })
})

describe('buildRuleContext — GSC parsing', () => {
  it('maps query-dim gsc evidence into keywordMetrics', () => {
    const ctx = build([
      ev({
        id: 'gscq', type: 'gsc',
        payload: { dimension: 'query', rows: [{ keys: ['buy widgets'], clicks: 10, impressions: 500, ctr: 0.02, position: 8 }] },
      }),
    ])
    expect(ctx.keywordMetrics).toHaveLength(1)
    expect(ctx.keywordMetrics[0]).toMatchObject({ evidenceId: 'gscq', dimension: 'query', keyText: 'buy widgets', impressions: 500, position: 8 })
    expect(ctx.queryPageMetrics).toHaveLength(0)
  })
  it('maps queryPage-dim gsc evidence into queryPageMetrics (keys = [page, query])', () => {
    const ctx = build([
      ev({
        id: 'gscp', type: 'gsc',
        payload: { dimension: 'queryPage', rows: [{ keys: ['https://example.com/a', 'widgets'], clicks: 3, impressions: 90, position: 5 }] },
      }),
    ])
    expect(ctx.queryPageMetrics).toHaveLength(1)
    expect(ctx.queryPageMetrics[0]).toMatchObject({ evidenceId: 'gscp', page: 'https://example.com/a', query: 'widgets', impressions: 90 })
    expect(ctx.keywordMetrics).toHaveLength(0)
  })
  it('skips rows with empty keys', () => {
    const ctx = build([
      ev({ id: 'gscq', type: 'gsc', payload: { dimension: 'query', rows: [{ keys: [], clicks: 0, impressions: 0, ctr: 0, position: 0 }] } }),
    ])
    expect(ctx.keywordMetrics).toHaveLength(0)
  })
  it('defaults new context fields to empty arrays when no psi/gsc evidence', () => {
    const ctx = build([])
    expect(ctx.psiChecks).toEqual([])
    expect(ctx.keywordMetrics).toEqual([])
    expect(ctx.queryPageMetrics).toEqual([])
  })
})

describe('parseGscKeywordMetrics', () => {
  const ev = (id: string, dimension: string, rows: unknown[]) => ({
    id, type: 'gsc' as const, claimLevel: 'L4' as const, source: 'gsc', sitePageId: null, rawText: '',
    payload: { dimension, rows },
  })
  it('解析 query 维行（num 归一）', () => {
    const out = parseGscKeywordMetrics([
      ev('g1', 'query', [{ keys: ['widget'], clicks: 2, impressions: 100, ctr: 0.02, position: 5.4 }]),
    ])
    expect(out).toEqual([
      { evidenceId: 'g1', dimension: 'query', keyText: 'widget', clicks: 2, impressions: 100, ctr: 0.02, position: 5.4 },
    ])
  })
  it('跳过 queryPage 维与无 key 行', () => {
    const out = parseGscKeywordMetrics([
      ev('g2', 'queryPage', [{ keys: ['p', 'q'], impressions: 5 }]),
      ev('g3', 'query', [{ impressions: 9 }]),
    ])
    expect(out).toEqual([])
  })
})
