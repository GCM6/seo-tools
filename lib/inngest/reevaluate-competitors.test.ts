import { describe, it, expect, vi } from 'vitest'
import { reevaluateCompetitorsHandler } from './reevaluate-competitors'
import type { RuleHit } from '@/lib/diagnosis/types'

function makeHit(over: Partial<RuleHit> = {}): RuleHit {
  return {
    ruleId: 'K03', pillar: 'P3', side: 'seo', severity: 'notice', claimType: 'measured_sample',
    fingerprint: 'fp_new', title: '缺口词', description: '竞品占位而本站缺席。', evidenceRefs: ['ev_serp'], scope: 'keywords:gap:missing',
    ...over,
  }
}

const seedSerpEvidence = {
  id: 'ev_serp', type: 'dataforseo_serp', claimLevel: 'L3', source: 'example.com', sitePageId: null,
  rawText: '', payload: { kind: 'seed_serp', engine: 'google', locationCode: 2276, languageCode: 'de', results: [
    { keyword: 'best crm', items: [{ domain: 'rival.com', url: 'https://rival.com', rank: 1 }] },
  ] },
}
const labsEvidence = {
  id: 'ev_labs', type: 'dataforseo_labs', claimLevel: 'L3', source: 'example.com', sitePageId: null,
  rawText: '', payload: { kind: 'keyword_data', keywords: [{ keyword: 'best crm', searchVolume: 500, difficulty: 30, cpc: 2, intent: 'commercial' }] },
}

function makeDeps(over: Record<string, unknown> = {}) {
  return {
    getProject: vi.fn(async () => ({ id: 'proj_1', domain: 'example.com', industry: '', market: 'de', language: 'de', competitors: ['manual.com'] })),
    getConfirmedCompetitors: vi.fn(async () => [{ id: 'cmp_1', domain: 'rival.com', name: 'Rival' }]),
    getRunEvidence: vi.fn(async () => [seedSerpEvidence, labsEvidence]),
    getRunPrompts: vi.fn(async () => []),
    getRunProbeResults: vi.fn(async () => []),
    getFindings: vi.fn(async () => [{ fingerprint: 'fp_existing' }]),
    upsertKeyword: vi.fn(async () => [{ id: 'kw_1' }]),
    createKeywordGaps: vi.fn(async (rows: unknown[]) => rows),
    createFindings: vi.fn(async (rows: unknown[]) => rows),
    createRecommendations: vi.fn(async (rows: unknown[]) => rows),
    computeKeywordGaps: vi.fn((_input: unknown) => [
      { keyword: 'best crm', gapType: 'missing' as const, ourPosition: null, competitorPositions: [{ domain: 'rival.com', position: 1 }], opportunityScore: 80, searchVolume: 500 },
    ]),
    // 两条命中：一条 fingerprint 已存在（应被过滤），一条新的。
    evaluateRules: vi.fn(() => [makeHit({ fingerprint: 'fp_new' }), makeHit({ ruleId: 'T01', fingerprint: 'fp_existing' })]),
    buildRuleContext: vi.fn((_input: unknown) => ({}) as never),
    aggregateProbeSummary: vi.fn((_input: unknown) => null),
    createEvidenceArtifact: vi.fn(async (row: unknown) => row),
    fetchLightCheck: vi.fn(async (url: string) => ({
      url, finalUrl: url, httpStatus: 200, title: 'Rival CRM', canonicalUrl: null, metaRobots: null,
      mainTextChars: 3000, contentHash: 'h', internalLinks: [], checkStatus: 'checked' as const, errorReason: null,
      extra: { hasViewport: true, hreflangEntries: [], imgCount: 0, imgAltMissing: 0, listCount: 6, tableCount: 0, avgParagraphLen: 0, h2QuestionRate: 0, isHttps: true, mixedContentCount: 0, redirected: false },
    })),
    allRules: async () => [],
    generateRecommendation: vi.fn(async (hit: RuleHit) => ({ what: `修：${hit.title}`, why: hit.description, effort: 'mid', validationMethod: '复测' })),
    ...over,
  }
}

function asDeps(deps: ReturnType<typeof makeDeps>): Parameters<typeof reevaluateCompetitorsHandler>[1] {
  return deps as unknown as Parameters<typeof reevaluateCompetitorsHandler>[1]
}

function makeArgs() {
  const published: unknown[] = []
  return {
    args: {
      event: { data: { runId: 'run_1', projectId: 'proj_1' } },
      step: { run: async <T,>(_id: string, fn: () => Promise<T> | T): Promise<T> => JSON.parse(JSON.stringify((await fn()) ?? null)) as T },
      publish: async (msg: unknown) => { published.push(msg) },
    },
    published,
  }
}

describe('reevaluateCompetitorsHandler', () => {
  it('按 fingerprint 只落新增 finding，不重复已存在的', async () => {
    const deps = makeDeps()
    const { args } = makeArgs()
    const result = await reevaluateCompetitorsHandler(args, asDeps(deps))

    expect(result).toEqual({ status: 'reviewing', newFindings: 1 })
    const findingRows = deps.createFindings.mock.calls[0][0] as Array<{ fingerprint: string }>
    expect(findingRows).toHaveLength(1)
    expect(findingRows[0].fingerprint).toBe('fp_new')
    const recRows = deps.createRecommendations.mock.calls[0][0] as unknown[]
    expect(recRows).toHaveLength(1)
  })

  it('确认竞品 + seed_serp → 轻检并落 competitor_content_form 证据（SP-A2）', async () => {
    const deps = makeDeps()
    const { args } = makeArgs()
    await reevaluateCompetitorsHandler(args, asDeps(deps))

    expect(deps.fetchLightCheck).toHaveBeenCalledWith('https://rival.com', 'rival.com')
    expect(deps.createEvidenceArtifact).toHaveBeenCalledOnce()
    const ev = deps.createEvidenceArtifact.mock.calls[0][0] as { type: string; claimLevel: string; payload: { kind: string; signals: unknown[] } }
    expect(ev.type).toBe('dataforseo_serp')
    expect(ev.claimLevel).toBe('L3')
    expect(ev.payload.kind).toBe('competitor_content_form')
    expect(ev.payload.signals).toHaveLength(1)
  })

  it('无确认竞品时不落 competitor_content_form 证据', async () => {
    const deps = makeDeps({ getConfirmedCompetitors: vi.fn(async () => []) })
    const { args } = makeArgs()
    await reevaluateCompetitorsHandler(args, asDeps(deps))
    expect(deps.createEvidenceArtifact).not.toHaveBeenCalled()
  })

  it('计算并落 keyword_gaps，evidenceId 指向 seed_serp 证据', async () => {
    const deps = makeDeps()
    const { args } = makeArgs()
    await reevaluateCompetitorsHandler(args, asDeps(deps))

    expect(deps.computeKeywordGaps).toHaveBeenCalledOnce()
    const gapInput = deps.computeKeywordGaps.mock.calls[0][0] as { ownDomain: string; confirmedCompetitorDomains: string[] }
    expect(gapInput.ownDomain).toBe('example.com')
    expect(gapInput.confirmedCompetitorDomains).toEqual(['rival.com'])

    const gapRows = deps.createKeywordGaps.mock.calls[0][0] as Array<{ evidenceId: string; gapType: string; keywordId: string; opportunityScore: string }>
    expect(gapRows).toHaveLength(1)
    expect(gapRows[0]).toMatchObject({ evidenceId: 'ev_serp', gapType: 'missing', keywordId: 'kw_1', opportunityScore: '80' })
  })

  it('RuleContext 收到确认竞品与缺口（含 evidenceId），探针竞品集并入确认域', async () => {
    const deps = makeDeps()
    const { args } = makeArgs()
    await reevaluateCompetitorsHandler(args, asDeps(deps))

    const ctxInput = deps.buildRuleContext.mock.calls[0][0] as {
      confirmedCompetitors: { domain: string; name: string }[]
      keywordGaps: { keyword: string; evidenceId: string }[]
    }
    expect(ctxInput.confirmedCompetitors).toEqual([{ domain: 'rival.com', name: 'Rival' }])
    expect(ctxInput.keywordGaps).toEqual([
      { keyword: 'best crm', gapType: 'missing', ourPosition: null, opportunityScore: 80, searchVolume: 500, evidenceId: 'ev_serp' },
    ])
    const probeInput = deps.aggregateProbeSummary.mock.calls[0][0] as { competitors: string[] }
    expect(probeInput.competitors.sort()).toEqual(['manual.com', 'rival.com'])
  })

  it('无确认竞品 → 不算 gap、不落 keyword_gaps', async () => {
    const deps = makeDeps({ getConfirmedCompetitors: vi.fn(async () => []) })
    const { args } = makeArgs()
    await reevaluateCompetitorsHandler(args, asDeps(deps))
    expect(deps.computeKeywordGaps).not.toHaveBeenCalled()
    expect(deps.createKeywordGaps).not.toHaveBeenCalled()
  })

  it('项目缺失 → 抛错，不落库', async () => {
    const deps = makeDeps({ getProject: vi.fn(async () => undefined) })
    const { args } = makeArgs()
    await expect(reevaluateCompetitorsHandler(args, asDeps(deps))).rejects.toThrow()
    expect(deps.createFindings).not.toHaveBeenCalled()
  })
})
