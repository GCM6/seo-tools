import { describe, it, expect, vi } from 'vitest'
import { NonRetriableError } from 'inngest'
import { generateFindingsHandler } from './generate-findings'
import type { RuleHit } from '@/lib/diagnosis/types'

function makeHit(overrides: Partial<RuleHit> = {}): RuleHit {
  return {
    ruleId: 'T01',
    pillar: 'P1',
    side: 'technical',
    severity: 'error',
    claimType: 'measured_hard',
    fingerprint: 'fp_1',
    title: '入口页被 noindex',
    description: '首页 meta robots 含 noindex，将被搜索引擎排除。',
    evidenceRefs: ['ev_1'],
    scope: 'site',
    ...overrides,
  }
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    getRunEvidence: vi.fn(async () => [
      { id: 'ev_1', type: 'page_fetch', claimLevel: 'L4', source: 'https://example.com/', payload: {}, rawText: '<html></html>', sitePageId: null },
    ]),
    getProject: vi.fn(async () => ({
      id: 'proj_1', domain: 'example.com', industry: '', market: 'US', language: 'en', competitors: ['rival.com'], ownerId: 'local',
    })),
    getRunPrompts: vi.fn(async () => [{ id: 'p_1', text: 'best tool?', priority: 0 }]),
    getRunProbeResults: vi.fn(async () => []),
    createFindings: vi.fn(async (rows: unknown[]) => rows),
    createRecommendations: vi.fn(async (rows: unknown[]) => rows),
    markRunStatus: vi.fn(async () => undefined),
    // 问题台账（spec 2026-10-09 §5.1）：默认只有 crawl 采集成功、无既有问题、本次体检未对账过。
    getRunDataSourceStatuses: vi.fn(async () => [{ sourceKey: 'crawl', status: 'collected', capturedEvidenceCount: 21 }]),
    getRun: vi.fn(async (id: string) => ({ id, startedAt: '2026-11-01T00:00:00.000Z', finishedAt: null, protocolHash: 'P1' })),
    saveCheckLedger: vi.fn(async () => undefined),
    getProjectIssues: vi.fn(async () => []),
    saveIssueChanges: vi.fn(async () => undefined),
    hasObservedEvents: vi.fn(async () => false),
    recomputeRetestDue: vi.fn(async () => null),
    // 已确认竞品与关键词缺口（spec §5.4-1）：默认无已确认竞品 → 不算缺口、不落库。
    getConfirmedCompetitors: vi.fn(async () => []),
    upsertKeyword: vi.fn(async () => [{ id: 'kw_1' }]),
    createKeywordGaps: vi.fn(async (rows: unknown[]) => rows),
    computeKeywordGaps: vi.fn(() => []),
    // 引擎/上下文构造注入 fake：evaluateRulesWithLedger 直接返回预置 hits + 台账，忽略 ctx。
    buildRuleContext: vi.fn(() => ({}) as never),
    evaluateRulesWithLedger: vi.fn(() => ({
      hits: [makeHit(), makeHit({ ruleId: 'C01', side: 'seo', claimType: 'inferred', title: '标题缺失', evidenceRefs: ['ev_1'], fingerprint: 'fp_2' })],
      ledger: [
        { ruleId: 'T01', ruleVersion: 1, outcome: 'hit', reasonKind: null, reason: null, hitCount: 1 },
        { ruleId: 'C01', ruleVersion: 1, outcome: 'hit', reasonKind: null, reason: null, hitCount: 1 },
        { ruleId: 'K01', ruleVersion: 1, outcome: 'not_checked', reasonKind: 'data_gap', reason: '缺数据源：gsc', hitCount: 0 },
      ],
    })),
    buildIntentPageFitMap: vi.fn(() => ({ rows: [], overbroadPages: [] })),
    buildIntentPageFitArtifactPayload: vi.fn(() => ({
      kind: 'intent_page_fit_map',
      version: 1,
      rowCount: 0,
      issueRowCount: 0,
      issueCounts: {
        missing_landing_page: 0,
        intent_page_mismatch: 0,
        overbroad_landing_page: 0,
        underlinked_landing_page: 0,
        thin_landing_page: 0,
        competing_pages: 0,
      },
      rows: [],
      overbroadPages: [],
    })),
    aggregateProbeSummary: vi.fn(() => null),
    allRules: async () => [],
    generateRecommendation: vi.fn(async (hit: RuleHit) => ({
      what: `修复：${hit.title}`,
      why: hit.description,
      expectedImpact: '恢复索引',
      effort: 'low',
      risk: 'low',
      validationMethod: '复检 meta robots',
      priority: 'P0',
    })),
    ...overrides,
  }
}

function asDeps(deps: ReturnType<typeof makeDeps>): Parameters<typeof generateFindingsHandler>[1] {
  return deps as unknown as Parameters<typeof generateFindingsHandler>[1]
}

function makeArgs(dataOverrides: Record<string, unknown> = {}) {
  const published: unknown[] = []
  return {
    args: {
      event: { data: { runId: 'run_1', projectId: 'proj_1', ...dataOverrides } },
      // 复刻 Inngest：step.run 返回值经 JSON 往返落库回放（富对象退化为字符串）。
      step: {
        run: async <T,>(_id: string, fn: () => Promise<T> | T): Promise<T> => {
          const out = await fn()
          return (out === undefined ? undefined : JSON.parse(JSON.stringify(out))) as T
        },
      },
      publish: async (msg: unknown) => {
        published.push(msg)
      },
    },
    published,
  }
}

const dataOf = (m: unknown) => (m as { data: RunProgressMessageLike }).data
type RunProgressMessageLike = { type: string; phase?: string; findings?: number }

describe('generateFindingsHandler', () => {
  it('规则求值 → 每命中一 finding + 一 recommendation，run 收尾到 reviewing', async () => {
    const deps = makeDeps()
    const { args, published } = makeArgs()

    const result = await generateFindingsHandler(args, asDeps(deps))

    expect(result).toEqual({ status: 'reviewing', findings: 2 })

    // 状态机：先 diagnosing 后 reviewing
    expect(deps.markRunStatus).toHaveBeenNthCalledWith(1, 'run_1', 'diagnosing', { failureReason: null })
    expect(deps.markRunStatus).toHaveBeenLastCalledWith(
      'run_1', 'reviewing', expect.objectContaining({ finishedAt: expect.any(String), failureReason: null }),
    )

    // findings 落库：2 条，均带 evidenceRefs 与 claimType（证据先于结论）
    const findingRows = deps.createFindings.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(findingRows).toHaveLength(2)
    findingRows.forEach((r) => {
      expect((r.evidenceRefs as string[]).length).toBeGreaterThan(0)
      expect(r.status).toBe('open')
      expect(String(r.id)).toMatch(/^find_/)
    })
    // severity 映射 error→high，claim_type 透传
    expect(findingRows[0]).toMatchObject({ side: 'technical', severity: 'high', claimType: 'measured_hard', confidence: '实测' })
    expect(findingRows[1]).toMatchObject({ side: 'seo', claimType: 'inferred', confidence: '推断' })

    // recommendations：每 finding 一条 draft
    const recRows = deps.createRecommendations.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(recRows).toHaveLength(2)
    recRows.forEach((r) => expect(r.status).toBe('draft'))
    expect(deps.buildIntentPageFitMap).toHaveBeenCalledOnce()
    expect(deps.buildIntentPageFitArtifactPayload).toHaveBeenCalledOnce()

    // done 帧广播 + 诊断阶段带 findings 计数
    expect(published.some((m) => dataOf(m).type === 'done')).toBe(true)
    const diagnosePhases = published.map(dataOf).filter((d) => d.type === 'phase' && d.phase === 'diagnose')
    expect(diagnosePhases.some((d) => d.findings === 2)).toBe(true)
  })

  it('finding↔recommendation id 配对正确（rec.findingId 指向对应 finding）', async () => {
    const deps = makeDeps()
    const { args } = makeArgs()

    await generateFindingsHandler(args, asDeps(deps))

    const findingRows = deps.createFindings.mock.calls[0][0] as Array<{ id: string }>
    const recRows = deps.createRecommendations.mock.calls[0][0] as Array<{ id: string; findingId: string }>

    expect(recRows.map((r) => r.findingId)).toEqual(findingRows.map((f) => f.id))
    // rec 自身 id 独立且带前缀
    recRows.forEach((r) => expect(r.id).toMatch(/^rec_/))
    expect(new Set(recRows.map((r) => r.id)).size).toBe(2)
    // generateRecommendation 按 hit 逐条调用，带 domain
    expect(deps.generateRecommendation).toHaveBeenCalledTimes(2)
    expect((deps.generateRecommendation.mock.calls[0] as unknown[])[1]).toEqual({ domain: 'example.com' })
  })

  it('无命中时不落库任何 finding/recommendation，仍收尾 reviewing', async () => {
    const deps = makeDeps({ evaluateRulesWithLedger: vi.fn(() => ({ hits: [], ledger: [] })) })
    const { args, published } = makeArgs()

    const result = await generateFindingsHandler(args, asDeps(deps))

    expect(result).toEqual({ status: 'reviewing', findings: 0 })
    expect(deps.createFindings).toHaveBeenCalledWith([])
    expect(deps.createRecommendations).toHaveBeenCalledWith([])
    expect(deps.generateRecommendation).not.toHaveBeenCalled()
    expect(published.some((m) => dataOf(m).type === 'done')).toBe(true)
  })

  it('项目缺失时抛 NonRetriableError，不进入 reviewing', async () => {
    const deps = makeDeps({ getProject: vi.fn(async () => undefined) })
    const { args } = makeArgs()

    await expect(generateFindingsHandler(args, asDeps(deps))).rejects.toThrow(NonRetriableError)

    expect(deps.createFindings).not.toHaveBeenCalled()
    expect(deps.markRunStatus).not.toHaveBeenCalledWith('run_1', 'reviewing', expect.anything())
  })

  it('探针聚合喂给规则上下文：从项目竞品与 run prompts/probe 结果派生', async () => {
    const deps = makeDeps()
    const { args } = makeArgs()

    await generateFindingsHandler(args, asDeps(deps))

    expect(deps.aggregateProbeSummary).toHaveBeenCalledOnce()
    const probeInput = (deps.aggregateProbeSummary.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(probeInput.brand).toBe('example')
    expect(probeInput.competitors).toEqual(['rival.com'])
    // 遗留②修复（第二波任务）：run-rules step 此前未传 domain，citedDomains 的 owned 判定
    // 恒为 third_party；现在应补齐归一化后的裸 host（去协议、去 www，与 buildRunMetrics 同一写法）。
    expect(probeInput.domain).toBe('example.com')
    // buildRuleContext 收到派生的 project + 证据行
    const ctxInput = (deps.buildRuleContext.mock.calls[0] as unknown[])[0] as { project: { domain: string }; evidence: unknown[] }
    expect(ctxInput.project.domain).toBe('example.com')
    expect(ctxInput.evidence).toHaveLength(1)
  })

  it('主诊断带上已确认竞品与关键词缺口（spec §5.4-1：竞品类规则不再只在再评估里跑）', async () => {
    const serp = { id: 'ev_serp', type: 'dataforseo_serp', claimLevel: 'L3', source: 'dataforseo', rawText: '', sitePageId: null, payload: { kind: 'seed_serp', results: [{ keyword: 'k', items: [] }] } }
    const deps = makeDeps({
      getRunEvidence: vi.fn(async () => [serp]),
      getConfirmedCompetitors: vi.fn(async () => [{ id: 'cmp_1', domain: 'rival.com', name: 'Rival' }]),
      computeKeywordGaps: vi.fn(() => [{ keyword: 'k', gapType: 'missing', ourPosition: null, competitorPositions: [{ domain: 'rival.com', position: 3 }], opportunityScore: 2, searchVolume: 100 }]),
    })
    const { args } = makeArgs()
    await generateFindingsHandler(args, asDeps(deps))
    const ctxInput = (deps.buildRuleContext.mock.calls[0] as unknown[])[0] as { confirmedCompetitors: unknown[]; keywordGaps: unknown[]; project: { competitors: string[] } }
    expect(ctxInput.confirmedCompetitors).toEqual([{ domain: 'rival.com', name: 'Rival' }])
    expect(ctxInput.keywordGaps).toEqual([{ keyword: 'k', gapType: 'missing', ourPosition: null, opportunityScore: 2, searchVolume: 100, evidenceId: 'ev_serp' }])
    // 规则上下文的项目竞品仍是手填集；只有探针聚合用「手填 ∪ 已确认」。
    expect(ctxInput.project.competitors).toEqual(['rival.com'])
    expect(deps.createKeywordGaps).toHaveBeenCalledTimes(1)
    const probeInput = (deps.aggregateProbeSummary.mock.calls[0] as unknown[])[0] as { competitors: string[] }
    expect(probeInput.competitors).toEqual(['rival.com', 'Rival'])
  })

  it('run-rules 路径下 domain 归一化：project.domain 带协议/www 时 aggregateProbeSummary 收到裸 host', async () => {
    const deps = makeDeps({
      getProject: vi.fn(async () => ({
        id: 'proj_1', domain: 'https://www.example.com', industry: '', market: 'US', language: 'en', competitors: ['rival.com'], ownerId: 'local',
      })),
    })
    const { args } = makeArgs()

    await generateFindingsHandler(args, asDeps(deps))

    const probeInput = (deps.aggregateProbeSummary.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(probeInput.domain).toBe('example.com')
  })
})

describe('问题台账接入（spec 2026-10-09 §5.1）', () => {
  it('按本次数据源状态求值：入口页恒可用，collected 的数据源可用', async () => {
    const deps = makeDeps()
    await generateFindingsHandler(makeArgs().args, asDeps(deps))
    const available = (deps.evaluateRulesWithLedger.mock.calls[0] as unknown[])[2] as Set<string>
    expect([...available].sort()).toEqual(['crawl', 'entry'])
  })

  it('台账整份落库', async () => {
    const deps = makeDeps()
    await generateFindingsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveCheckLedger).toHaveBeenCalledWith('run_1', expect.arrayContaining([expect.objectContaining({ ruleId: 'K01', outcome: 'not_checked' })]))
  })

  it('对账：两条命中各建一个待处理问题，并重算复查提醒；在标记完成之前', async () => {
    const deps = makeDeps()
    await generateFindingsHandler(makeArgs().args, asDeps(deps))
    const saved = (deps.saveIssueChanges.mock.calls[0] as unknown[])[0] as { issues: { fingerprint: string; status: string; firstSeenRunId: string; lastCheckedAt: string; protocolHash: string }[]; events: unknown[] }
    expect(saved.issues.map((i) => i.fingerprint).sort()).toEqual(['fp_1', 'fp_2'])
    expect(saved.issues.every((i) => i.status === 'pending' && i.firstSeenRunId === 'run_1')).toBe(true)
    expect(saved.issues[0].lastCheckedAt).toBe('2026-11-01T00:00:00.000Z')
    expect(saved.issues[0].protocolHash).toBe('P1')
    expect(saved.events).toHaveLength(2)
    expect(deps.recomputeRetestDue).toHaveBeenCalledWith('proj_1')
    const reviewingCall = deps.markRunStatus.mock.calls.findIndex((c: unknown[]) => c[1] === 'reviewing')
    expect(reviewingCall).toBeGreaterThanOrEqual(0)
    const reviewingOrder = deps.markRunStatus.mock.invocationCallOrder[reviewingCall]
    // 台账先落库，再对账，再重算复查提醒，最后才标记完成。
    expect(deps.saveCheckLedger.mock.invocationCallOrder[0]).toBeLessThan(deps.saveIssueChanges.mock.invocationCallOrder[0])
    expect(deps.saveIssueChanges.mock.invocationCallOrder[0]).toBeLessThan(deps.recomputeRetestDue.mock.invocationCallOrder[0])
    expect(deps.recomputeRetestDue.mock.invocationCallOrder[0]).toBeLessThan(reviewingOrder)
  })

  it('本次体检已对账过（步骤提交后重放）→ 不再写问题，但仍重算复查提醒', async () => {
    const deps = makeDeps({ hasObservedEvents: vi.fn(async () => true) })
    await generateFindingsHandler(makeArgs().args, asDeps(deps))
    expect(deps.saveIssueChanges).not.toHaveBeenCalled()
    // 重算是独立一步，不被「已对账」守卫跳过：对账提交后重算失败重试时，复查提醒不能停在旧值。
    expect(deps.recomputeRetestDue).toHaveBeenCalledWith('proj_1')
  })

  it('对账失败 → 抛出（交给 Inngest 重试与 onFailure），不标记完成', async () => {
    const deps = makeDeps({ saveIssueChanges: vi.fn(async () => { throw new Error('db locked') }) })
    await expect(generateFindingsHandler(makeArgs().args, asDeps(deps))).rejects.toThrow('db locked')
    expect(deps.markRunStatus.mock.calls.some((c: unknown[]) => c[1] === 'reviewing')).toBe(false)
  })

  it('协议相关规则的编号经 step 结果回放后仍生效：协议哈希变了且这次没命中 → 关闭为「检测口径变了」', async () => {
    const existing = {
      id: 'iss_g05', projectId: 'proj_1', fingerprint: 'fp_g05', ruleId: 'G05', ruleVersion: 1, pillar: 'P5', side: 'geo',
      title: 'AI 提及率低', severity: 'mid', affectedCount: null, latestFindingId: null,
      decision: 'pending', decisionReason: null, decidedAt: null, decidedBy: null,
      executedAt: null, executedNote: null, executedBy: null,
      detection: 'present', status: 'pending', flags: [], unverifiedReason: null, retiredReason: null,
      protocolHash: 'P0', firstSeenRunId: 'run_0', lastSeenRunId: 'run_0', lastCheckedRunId: 'run_0',
      lastCheckedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    }
    const deps = makeDeps({
      allRules: async () => [{ id: 'G05', version: 1, pillar: 'P5', side: 'geo', severity: 'warning', claimType: 'inferred', requiredSources: ['ai_probe'], evaluate: () => null }],
      evaluateRulesWithLedger: vi.fn(() => ({
        hits: [],
        ledger: [{ ruleId: 'G05', ruleVersion: 1, outcome: 'clear', reasonKind: null, reason: null, hitCount: 0 }],
      })),
      getProjectIssues: vi.fn(async () => [existing]),
    })
    await generateFindingsHandler(makeArgs().args, asDeps(deps))
    const saved = (deps.saveIssueChanges.mock.calls[0] as unknown[])[0] as { issues: { id: string; status: string; retiredReason: string | null }[] }
    expect(saved.issues).toHaveLength(1)
    expect(saved.issues[0]).toMatchObject({ id: 'iss_g05', status: 'retired', retiredReason: 'protocol_changed' })
  })

  it('带 baselineRunId 也不再读基线建议或写回测快照（旧回测对比已停用）', async () => {
    // 旧回测依赖已不在 makeDeps 里：持有 mock 引用才能断言「没被调用」（类型上 deps 也不再有这些键）。
    const getRecommendations = vi.fn(async () => [])
    const createRetestSnapshots = vi.fn(async () => undefined)
    const setRecommendationOutcome = vi.fn(async () => undefined)
    const deps = makeDeps({ getRecommendations, createRetestSnapshots, setRecommendationOutcome })
    const result = await generateFindingsHandler(makeArgs({ baselineRunId: 'run_base' }).args, asDeps(deps))
    expect(result).toEqual({ status: 'reviewing', findings: 2 })
    expect(getRecommendations).not.toHaveBeenCalled()
    expect(createRetestSnapshots).not.toHaveBeenCalled()
    expect(setRecommendationOutcome).not.toHaveBeenCalled()
  })
})
