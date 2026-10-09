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

// 已落库的发现行（getFindings 的返回形状）：对账只用到这几列。
function findingRow(over: Record<string, unknown> = {}) {
  return { id: 'find_1', fingerprint: 'fp_1', ruleId: 'Q01', title: '竞品占位', pillar: 'P3', side: 'seo', severity: 'notice', detail: null, ...over }
}

function makeDeps(over: Record<string, unknown> = {}) {
  return {
    getProject: vi.fn(async () => ({ id: 'proj_1', domain: 'example.com', industry: '', market: 'de', language: 'de', competitors: ['manual.com'] })),
    getConfirmedCompetitors: vi.fn(async () => [{ id: 'cmp_1', domain: 'rival.com', name: 'Rival' }]),
    getRunEvidence: vi.fn(async () => [seedSerpEvidence, labsEvidence]),
    getRunPrompts: vi.fn(async () => []),
    getRunProbeResults: vi.fn(async () => []),
    getFindings: vi.fn(async () => [findingRow({ id: 'find_existing', ruleId: 'T01', fingerprint: 'fp_existing' })]),
    upsertKeyword: vi.fn(async () => [{ id: 'kw_1' }]),
    createKeywordGaps: vi.fn(async (rows: unknown[]) => rows),
    createFindings: vi.fn(async (rows: unknown[]) => rows),
    createRecommendations: vi.fn(async (rows: unknown[]) => rows),
    computeKeywordGaps: vi.fn((input: unknown) => {
      void input
      return [
      { keyword: 'best crm', gapType: 'missing' as const, ourPosition: null, competitorPositions: [{ domain: 'rival.com', position: 1 }], opportunityScore: 80, searchVolume: 500 },
      ]
    }),
    // 两条命中：一条 fingerprint 已存在（应被过滤），一条新的；台账：Q01 现在命中、T02 没问题。
    evaluateRulesWithLedger: vi.fn(() => ({
      hits: [makeHit({ fingerprint: 'fp_new' }), makeHit({ ruleId: 'T01', fingerprint: 'fp_existing' })],
      ledger: [
        { ruleId: 'Q01', ruleVersion: 1, outcome: 'hit', reasonKind: null, reason: null, hitCount: 1 },
        { ruleId: 'T02', ruleVersion: 1, outcome: 'clear', reasonKind: null, reason: null, hitCount: 0 },
      ],
    })),
    getRunDataSourceStatuses: vi.fn(async () => [{ sourceKey: 'dataforseo:seed_serp', status: 'collected', capturedEvidenceCount: 1 }]),
    // 首轮诊断时缺已确认竞品：Q01 没查；T02 查过且没问题。
    getRunCheckLedger: vi.fn(async () => [
      { ruleId: 'Q01', ruleVersion: 1, outcome: 'not_checked', reasonKind: 'data_gap', reason: '缺数据源：confirmed_competitors', hitCount: 0 },
      { ruleId: 'T02', ruleVersion: 1, outcome: 'clear', reasonKind: null, reason: null, hitCount: 0 },
    ]),
    saveCheckLedger: vi.fn(async (runId: string, rows: unknown[]) => { void runId; void rows }),
    getProjectRuns: vi.fn(async () => [{ id: 'run_1', status: 'reviewing', startedAt: '2026-11-01T00:00:00.000Z', finishedAt: null, protocolHash: 'P1' }]),
    getProjectIssues: vi.fn(async () => []),
    saveIssueChanges: vi.fn(async (changes: unknown) => { void changes }),
    recomputeRetestDue: vi.fn(async (projectId: string) => { void projectId; return null }),
    buildRuleContext: vi.fn((input: unknown) => {
      void input
      return {} as never
    }),
    aggregateProbeSummary: vi.fn((input: unknown) => {
      void input
      return null
    }),
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
    // SP-A2 #6：探针 SoV 竞品集并入确认竞品「名」（可被答案原文匹配），非纯域。
    const probeInput = deps.aggregateProbeSummary.mock.calls[0][0] as { competitors: string[]; domain?: string }
    expect(probeInput.competitors.sort()).toEqual(['Rival', 'manual.com'])
    // 第三波修复：此前未传 domain，citedDomains 的 owned 判定恒 third_party；现在应补上归一化裸 host。
    expect(probeInput.domain).toBe('example.com')
  })

  it('project.domain 带协议/www 时 aggregateProbeSummary 收到归一化后的裸 host', async () => {
    const deps = makeDeps({
      getProject: vi.fn(async () => ({
        id: 'proj_1', domain: 'https://www.example.com', industry: '', market: 'de', language: 'de', competitors: ['manual.com'],
      })),
    })
    const { args } = makeArgs()
    await reevaluateCompetitorsHandler(args, asDeps(deps))

    const probeInput = deps.aggregateProbeSummary.mock.calls[0][0] as { domain?: string }
    expect(probeInput.domain).toBe('example.com')
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

describe('竞品确认后的局部对账（spec 2026-10-09 §5.1）', () => {
  const ledgerRow = (ruleId: string, outcome: string, over: Record<string, unknown> = {}) => ({
    ruleId, ruleVersion: 1, outcome, reasonKind: outcome === 'not_checked' ? 'data_gap' : null,
    reason: outcome === 'not_checked' ? '缺数据源：confirmed_competitors' : null, hitCount: outcome === 'hit' ? 1 : 0, ...over,
  })
  // 评估结果：Q01 命中 n 条、T02 没问题。
  const evaluated = (q01HitCount = 1) => vi.fn(() => ({
    hits: [makeHit({ fingerprint: 'fp_new' })],
    ledger: [ledgerRow('Q01', 'hit', { hitCount: q01HitCount }), ledgerRow('T02', 'clear')],
  }))

  it('只改写台账里结果变了的规则，并只对这些规则对账', async () => {
    // Q01 的发现已落库（对账读库里的发现）；T01 的发现不在本次改写范围，对账必须忽略它。
    const deps = makeDeps({
      getFindings: vi.fn(async () => [
        findingRow({ id: 'find_q01', ruleId: 'Q01', fingerprint: 'fp_q01', severity: 'high' }),
        findingRow({ id: 'find_existing', ruleId: 'T01', fingerprint: 'fp_existing' }),
      ]),
    })
    await reevaluateCompetitorsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).toHaveBeenCalledWith('run_1', [expect.objectContaining({ ruleId: 'Q01', outcome: 'hit' })])
    expect(deps.saveIssueChanges).toHaveBeenCalledTimes(1)
    const saved = deps.saveIssueChanges.mock.calls[0][0] as { issues: { ruleId: string; latestFindingId: string }[] }
    expect(saved.issues).toHaveLength(1)
    expect(saved.issues.every((i) => i.ruleId === 'Q01')).toBe(true)
    expect(saved.issues[0].latestFindingId).toBe('find_q01')
    expect(deps.recomputeRetestDue).toHaveBeenCalledWith('proj_1')
    // 先写问题表、台账放最后：问题保存失败重试时，台账行仍显示「变了」，会再对账一次。
    expect(deps.saveIssueChanges.mock.invocationCallOrder[0]).toBeLessThan(deps.saveCheckLedger.mock.invocationCallOrder[0])
  })

  it('台账没有变化 → 不写台账、不对账、不重算复查提醒', async () => {
    const deps = makeDeps({ getRunCheckLedger: vi.fn(async () => [ledgerRow('Q01', 'hit'), ledgerRow('T02', 'clear')]) })
    await reevaluateCompetitorsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).not.toHaveBeenCalled()
    expect(deps.saveIssueChanges).not.toHaveBeenCalled()
    expect(deps.recomputeRetestDue).not.toHaveBeenCalled()
  })

  it('不是项目最近一次完成的体检 → 台账照写，但不对账、不重算复查提醒（Review Focus 4）', async () => {
    const deps = makeDeps({
      getProjectRuns: vi.fn(async () => [
        { id: 'run_1', status: 'output', startedAt: '2026-10-01T00:00:00.000Z', finishedAt: null, protocolHash: 'P1' },
        { id: 'run_newer', status: 'reviewing', startedAt: '2026-11-01T00:00:00.000Z', finishedAt: null, protocolHash: 'P1' },
      ]),
    })
    await reevaluateCompetitorsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).toHaveBeenCalled()
    expect(deps.saveIssueChanges).not.toHaveBeenCalled()
    expect(deps.recomputeRetestDue).not.toHaveBeenCalled()
  })

  it('首轮已查过（命中 / 没问题）的规则，哪怕数量变了也保持首轮记录：不改写台账、不动问题', async () => {
    const deps = makeDeps({
      getRunCheckLedger: vi.fn(async () => [ledgerRow('Q01', 'hit', { hitCount: 1 }), ledgerRow('T02', 'clear')]),
      evaluateRulesWithLedger: evaluated(2),
    })
    await reevaluateCompetitorsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).not.toHaveBeenCalled()
    expect(deps.saveIssueChanges).not.toHaveBeenCalled()
    expect(deps.recomputeRetestDue).not.toHaveBeenCalled()
  })

  it('首轮台账里根本没有这条规则 → 跳过（可能是部署间规则集变了），不改写、不对账', async () => {
    const deps = makeDeps({ getRunCheckLedger: vi.fn(async () => [ledgerRow('T02', 'clear')]) })
    await reevaluateCompetitorsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).not.toHaveBeenCalled()
    expect(deps.saveIssueChanges).not.toHaveBeenCalled()
    expect(deps.recomputeRetestDue).not.toHaveBeenCalled()
  })

  it('首轮是「出错」的规则现在查得出结果 → 同样改写并对账', async () => {
    const deps = makeDeps({
      getRunCheckLedger: vi.fn(async () => [ledgerRow('Q01', 'error', { reasonKind: 'error', reason: 'boom' }), ledgerRow('T02', 'clear')]),
      getFindings: vi.fn(async () => [findingRow({ id: 'find_q01', ruleId: 'Q01', fingerprint: 'fp_q01' })]),
    })
    await reevaluateCompetitorsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).toHaveBeenCalledWith('run_1', [expect.objectContaining({ ruleId: 'Q01', outcome: 'hit' })])
    expect(deps.saveIssueChanges).toHaveBeenCalledTimes(1)
    expect(deps.recomputeRetestDue).toHaveBeenCalledWith('proj_1')
  })

  it('按本次数据源状态求值：已确认竞品数与数据源状态一并传给 evaluateRulesWithLedger', async () => {
    const deps = makeDeps()
    await reevaluateCompetitorsHandler(makeArgs().args, asDeps(deps))
    expect(deps.getRunDataSourceStatuses).toHaveBeenCalledWith('run_1')
    const available = (deps.evaluateRulesWithLedger.mock.calls[0] as unknown[])[2] as Set<string>
    expect(available.has('confirmed_competitors')).toBe(true)
  })
})
