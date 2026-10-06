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

describe('buildRuleContext — social_presence 解析（G11/SP01/SP02）', () => {
  it('maps a social_presence evidence row into ctx.socialPresence', () => {
    const ctx = build([
      ev({
        id: 'sp1', type: 'social_presence',
        payload: {
          brand: 'Acme',
          platforms: [
            { platform: 'youtube', query: 'Acme review', resultCount: 0, topResults: [] },
            { platform: 'g2', query: 'Acme', resultCount: 2, topResults: [{ title: 'Acme on G2', url: 'https://g2.com/acme' }] },
          ],
          checkedAt: '2026-07-15T00:00:00.000Z',
        },
      }),
    ])
    expect(ctx.socialPresence).not.toBeNull()
    expect(ctx.socialPresence!.evidenceId).toBe('sp1')
    expect(ctx.socialPresence!.brand).toBe('Acme')
    expect(ctx.socialPresence!.platforms).toHaveLength(2)
    expect(ctx.socialPresence!.platforms[0]).toMatchObject({ platform: 'youtube', query: 'Acme review', resultCount: 0 })
    expect(ctx.socialPresence!.platforms[1].topResults).toEqual([{ title: 'Acme on G2', url: 'https://g2.com/acme' }])
  })
  it('defensively drops platform entries with an unrecognized platform value', () => {
    const ctx = build([
      ev({
        id: 'sp1', type: 'social_presence',
        payload: { brand: 'Acme', platforms: [{ platform: 'tiktok', query: 'Acme', resultCount: 5, topResults: [] }], checkedAt: '' },
      }),
    ])
    expect(ctx.socialPresence!.platforms).toHaveLength(0)
  })
  it('defaults missing fields defensively (no throw)', () => {
    const ctx = build([ev({ id: 'sp1', type: 'social_presence', payload: {} })])
    expect(ctx.socialPresence).toEqual({ brand: '', platforms: [], checkedAt: '', evidenceId: 'sp1' })
  })
  it('is null when no social_presence evidence present', () => {
    const ctx = build([])
    expect(ctx.socialPresence).toBeNull()
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

describe('buildRuleContext — third_party_presence 解析（SP-A §4.4）', () => {
  it('v2 载荷原样透传两路检查（含失败）', () => {
    const ctx = build([
      ev({
        id: 'tp2', type: 'third_party_presence', source: 'metadocu',
        payload: {
          version: 2, candidates: ['Metadocu'],
          wikipedia: { status: 'ok', exists: false, title: null, url: null },
          reddit: { status: 'failed', httpStatus: 403, reason: 'http_403', windowDays: 365 },
        },
      }),
    ])
    expect(ctx.thirdParty).toEqual({
      wikipedia: { status: 'ok', exists: false, title: null, url: null },
      reddit: { status: 'failed', httpStatus: 403, reason: 'http_403', windowDays: 365 },
      evidenceId: 'tp2',
    })
  })

  it('v1 旧载荷（10-03 metadocu 真实形态：Reddit 403 被记成 0、维基走全文搜索）→ 两路都标"无法核实"，不当测得值回放', () => {
    const ctx = build([ev({ id: 'tp1', type: 'third_party_presence', payload: { reddit: { mentions: 0, windowDays: 365 }, wikipedia: { exists: false, title: null, url: null } } })])
    expect(ctx.thirdParty).toEqual({
      wikipedia: { status: 'failed', httpStatus: null, reason: 'legacy_unverified' },
      reddit: { status: 'failed', httpStatus: null, reason: 'legacy_unverified', windowDays: 365 },
      evidenceId: 'tp1',
    })
  })

  it('v1 旧载荷里 Reddit 有正数提及 → 那是真拿到的结果，记 ok', () => {
    const ctx = build([ev({ id: 'tp1', type: 'third_party_presence', payload: { reddit: { mentions: 5, windowDays: 365 }, wikipedia: { exists: true, title: 'Acme', url: 'https://en.wikipedia.org/wiki/Acme' } } })])
    expect(ctx.thirdParty?.reddit).toEqual({ status: 'ok', mentions: 5, windowDays: 365 })
    expect(ctx.thirdParty?.wikipedia).toMatchObject({ status: 'failed', reason: 'legacy_unverified' })
  })
})

describe('buildRuleContext — social_presence 平台状态（SP-A §4.4）', () => {
  it('新载荷的 status / reason 原样透传', () => {
    const ctx = build([ev({ id: 'sp2', type: 'social_presence', payload: {
      brand: 'Acme', checkedAt: '2026-10-04T00:00:00.000Z',
      platforms: [
        { platform: 'youtube', query: 'q', status: 'failed', reason: 'http_403', resultCount: 0, topResults: [] },
        { platform: 'g2', query: 'q', status: 'ok', resultCount: 0, topResults: [] },
      ],
    } })])
    expect(ctx.socialPresence?.platforms.map((p) => [p.platform, p.status, p.reason])).toEqual([['youtube', 'failed', 'http_403'], ['g2', 'ok', undefined]])
  })
  it('旧载荷（无 status：当年失败也记 0 条）→ 有结果的记 ok，0 条记 failed/legacy_unverified', () => {
    const ctx = build([ev({ id: 'sp1', type: 'social_presence', payload: {
      brand: 'Acme', checkedAt: '2026-07-15T00:00:00.000Z',
      platforms: [
        { platform: 'youtube', query: 'q', resultCount: 0, topResults: [] },
        { platform: 'g2', query: 'q', resultCount: 2, topResults: [{ title: 't', url: 'https://g2.com/x' }] },
      ],
    } })])
    expect(ctx.socialPresence?.platforms.map((p) => [p.platform, p.status, p.reason])).toEqual([['youtube', 'failed', 'legacy_unverified'], ['g2', 'ok', undefined]])
  })
})
