import { describe, it, expect, vi } from 'vitest'
import { buildCompetitorInputs, persistKeywordGaps } from './competitor-context'
import type { DiagnosisEvidenceRow } from './types'

const serpEv: DiagnosisEvidenceRow = {
  id: 'ev_serp', type: 'dataforseo_serp', claimLevel: 'L3', source: 'dataforseo', rawText: '', sitePageId: null,
  payload: { kind: 'seed_serp', results: [{ keyword: 'remove pdf metadata', items: [] }] },
} as never
const labsEv: DiagnosisEvidenceRow = {
  id: 'ev_labs', type: 'dataforseo_labs', claimLevel: 'L3', source: 'dataforseo', rawText: '', sitePageId: null,
  payload: { keywords: [{ keyword: 'remove pdf metadata', searchVolume: 500 }] },
} as never

describe('buildCompetitorInputs', () => {
  // competitorPositions 取 computeKeywordGaps 的真实形状（{ domain, position }[]）。
  const gap = { keyword: 'remove pdf metadata', gapType: 'missing' as const, ourPosition: null, competitorPositions: [{ domain: 'rival.com', position: 3 }], opportunityScore: 4, searchVolume: 500 }

  it('有已确认竞品与种子 SERP → 计算缺口，规则上下文的缺口带 SERP 证据 id', () => {
    const compute = vi.fn(() => [gap])
    const out = buildCompetitorInputs({
      evidence: [serpEv, labsEv], confirmed: [{ domain: 'rival.com', name: 'Rival' }],
      projectDomain: 'https://metadocu.com/', projectCompetitors: ['metacleaner.com'], computeKeywordGaps: compute as never,
    })
    expect(compute).toHaveBeenCalledWith(expect.objectContaining({ ownDomain: 'https://metadocu.com/', confirmedCompetitorDomains: ['rival.com'] }))
    expect(out.confirmedCompetitors).toEqual([{ domain: 'rival.com', name: 'Rival' }])
    expect(out.ctxGaps).toEqual([{ keyword: 'remove pdf metadata', gapType: 'missing', ourPosition: null, opportunityScore: 4, searchVolume: 500, evidenceId: 'ev_serp' }])
    expect(out.probeCompetitors).toEqual(['metacleaner.com', 'Rival'])
  })

  it('没有已确认竞品 → 不计算缺口；没有种子 SERP → 不计算缺口', () => {
    const compute = vi.fn(() => [gap])
    expect(buildCompetitorInputs({ evidence: [serpEv], confirmed: [], projectDomain: 'https://a.com/', projectCompetitors: [], computeKeywordGaps: compute as never }).gaps).toEqual([])
    expect(buildCompetitorInputs({ evidence: [], confirmed: [{ domain: 'rival.com', name: null }], projectDomain: 'https://a.com/', projectCompetitors: [], computeKeywordGaps: compute as never }).gaps).toEqual([])
    expect(compute).not.toHaveBeenCalled()
  })

  it('竞品没名字时探针竞品集回退用域名', () => {
    const out = buildCompetitorInputs({ evidence: [], confirmed: [{ domain: 'rival.com', name: null }], projectDomain: 'https://a.com/', projectCompetitors: [], computeKeywordGaps: vi.fn(() => []) as never })
    expect(out.probeCompetitors).toEqual(['rival.com'])
  })
})

describe('persistKeywordGaps', () => {
  it('逐个 upsert 关键词并一次写入缺口行；没有缺口时不写', async () => {
    const deps = { upsertKeyword: vi.fn(async () => [{ id: 'kw_1' }]), createKeywordGaps: vi.fn(async (rows: unknown[]) => rows) }
    const gaps = [{ keyword: 'remove pdf metadata', gapType: 'missing' as const, ourPosition: null, competitorPositions: [{ domain: 'rival.com', position: 3 }], opportunityScore: 4, searchVolume: 500 }]
    expect(await persistKeywordGaps(deps as never, { projectId: 'proj_1', runId: 'run_1', market: 'global-en', language: 'en', gaps, serpEvidenceId: 'ev_serp' })).toBe(1)
    const rows = deps.createKeywordGaps.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(rows[0]).toMatchObject({ runId: 'run_1', keywordId: 'kw_1', gapType: 'missing', ourPosition: null, opportunityScore: '4', evidenceId: 'ev_serp' })
    expect(await persistKeywordGaps(deps as never, { projectId: 'proj_1', runId: 'run_1', market: '', language: '', gaps: [], serpEvidenceId: 'ev_serp' })).toBe(0)
    expect(deps.createKeywordGaps).toHaveBeenCalledTimes(1)
  })
})
