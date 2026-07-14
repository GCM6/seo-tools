import { describe, it, expect, vi } from 'vitest'
import { NonRetriableError } from 'inngest'
import { generateFindingsHandler } from './generate-findings'
import type { RuleHit } from '@/lib/diagnosis/types'
import { aggregateRuleStats } from '@/lib/diagnosis/rule-stats'

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
    // 回测收尾依赖：默认无 baseline → 不触达；有 baselineRunId 的用例按需覆盖。
    getFindings: vi.fn(async () => []),
    getRecommendations: vi.fn(async () => []),
    createRetestSnapshots: vi.fn(async (rows: unknown[]) => rows),
    setRecommendationOutcome: vi.fn(async () => undefined),
    // 引擎/上下文构造注入 fake：evaluateRules 直接返回预置 hits，忽略 ctx。
    buildRuleContext: vi.fn(() => ({}) as never),
    evaluateRules: vi.fn(() => [makeHit(), makeHit({ ruleId: 'C01', side: 'seo', claimType: 'inferred', title: '标题缺失', evidenceRefs: ['ev_1'] })]),
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
    const deps = makeDeps({ evaluateRules: vi.fn(() => []) })
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
    // buildRuleContext 收到派生的 project + 证据行
    const ctxInput = (deps.buildRuleContext.mock.calls[0] as unknown[])[0] as { project: { domain: string }; evidence: unknown[] }
    expect(ctxInput.project.domain).toBe('example.com')
    expect(ctxInput.evidence).toHaveLength(1)
  })

  // —— 回测收尾（spec §5.1-3）——
  const baselineFindings = [
    { id: 'f_b1', runId: 'run_base', fingerprint: 'fp_1', severity: 'high', pillar: 'P3', title: 'A', side: 'seo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null, metricTarget: { keywords: ['widget'] } },
    { id: 'f_b2', runId: 'run_base', fingerprint: 'fp_2', severity: 'high', pillar: 'P5', title: 'B', side: 'geo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null, metricTarget: null },
  ]
  const retestFindings = [
    { id: 'f_r2', runId: 'run_1', fingerprint: 'fp_2', severity: 'high', pillar: 'P5', title: 'B', side: 'geo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null, metricTarget: null },
    { id: 'f_r3', runId: 'run_1', fingerprint: 'fp_3', severity: 'mid', pillar: 'P2', title: 'C', side: 'seo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null, metricTarget: null },
  ]
  // rec_b1(P3/gsc impressions)：目标 widget，baseline 100→retest 300 → effective（真标量压过 fp_1 四态 resolved 也仍 effective）
  // rec_b2(P5/probe brand_presence)：fp_2 persistent（四态=ineffective），但 presence 2/10→5/10 上升 → effective（真标量翻盘）
  const baseRecs = [
    { id: 'rec_b1', runId: 'run_base', findingId: 'f_b1', validationSpec: { metricSource: 'gsc', metric: 'impressions', scope: 'keywords', direction: 'increase', windowDays: 28 } },
    { id: 'rec_b2', runId: 'run_base', findingId: 'f_b2', validationSpec: { metricSource: 'probe', metric: 'brand_presence', scope: 'site', direction: 'increase', windowDays: 28 } },
  ]

  const gscEv = (id: string, impressions: number) => ({
    id, type: 'gsc', claimLevel: 'L4', source: 'gsc', sitePageId: null, rawText: '',
    payload: { dimension: 'query', rows: [{ keys: ['widget'], clicks: 1, impressions, ctr: 0.01, position: 6 }] },
  })

  // overrides：按需覆盖（如缺陷1 守卫用例要改 getRunPrompts 的 branded 标注），
  // 放在展开末尾，调用方传入的覆盖既有 retest 默认 fixture。
  function makeRetestDeps(overrides: Record<string, unknown> = {}) {
    return makeDeps({
      getFindings: vi.fn(async (rid: string) => (rid === 'run_base' ? baselineFindings : retestFindings)),
      getRecommendations: vi.fn(async (rid: string) => (rid === 'run_base' ? baseRecs : [])),
      createRetestSnapshots: vi.fn(async (rows: unknown[]) => rows),
      setRecommendationOutcome: vi.fn(async () => undefined),
      // 两轮各自证据（GSC impressions 差异）+ 探针结果（presence 差异）
      getRunEvidence: vi.fn(async (rid: string) => [rid === 'run_base' ? gscEv('g_base', 100) : gscEv('g_retest', 300)]),
      getRunProbeResults: vi.fn(async (rid: string) =>
        (rid === 'run_base' ? [1, 2] : [1, 2, 3, 4, 5]).map((n) => ({
          promptId: `p${n}`, brandPresent: true, competitorsMentioned: [], evidenceId: `pe${n}`, provider: 'openai', sentiment: 'neutral',
        })),
      ),
      // presence = brandPresent 数 / 10（promptsTotal 固定 10）。D5：retest-metrics 的 brand_presence
      // 已切到 unbranded.present/total，这里的 fixture 全部当作 unbranded 提问处理（与旧全集口径
      // 在本用例里数值一致，只是字段搬了个家），故 unbranded 直接沿用同一组 present/total。
      aggregateProbeSummary: vi.fn((input: { results: unknown[] }) => ({
        promptsTotal: 10, promptsPresent: input.results.length, totalSamples: input.results.length,
        perPrompt: [], sov: [], perEngine: [], sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 }, sampleEvidenceId: null,
        unbranded: { present: input.results.length, total: 10, wilsonLow: 0 },
        branded: { perEngine: [] }, citationRate: 0,
      })),
      ...overrides,
    })
  }

  it('baselineRunId 存在时算 finding 四态 delta 并落 retest_snapshots', async () => {
    const deps = makeRetestDeps()
    const { args } = makeArgs({ baselineRunId: 'run_base' })

    await generateFindingsHandler(args, asDeps(deps))

    // 两轮 findings + baseline 建议均被读取
    expect(deps.getFindings).toHaveBeenCalledWith('run_base')
    expect(deps.getFindings).toHaveBeenCalledWith('run_1')
    expect(deps.getRecommendations).toHaveBeenCalledWith('run_base')

    // 快照四态行齐全：fp_1 仅 baseline → resolved；fp_2 两轮同严重度 → persistent；fp_3 仅 retest → new；无 regressed
    const snapRows = deps.createRetestSnapshots.mock.calls[0][0] as Array<Record<string, string>>
    const byMetric = Object.fromEntries(snapRows.map((r) => [r.metricName, r]))
    expect(byMetric['findings.resolved'].retestValue).toBe('1')
    expect(byMetric['findings.persistent'].retestValue).toBe('1')
    expect(byMetric['findings.new'].retestValue).toBe('1')
    expect(byMetric['findings.regressed'].retestValue).toBe('0')
    // 健康分 delta 行（两轮 overall 均可算）
    expect(byMetric['health.overall']).toBeDefined()
    // 插入行携带项目/回测锚点 + 前缀 id
    snapRows.forEach((r) => {
      expect(r.projectId).toBe('proj_1')
      expect(r.baselineRunId).toBe('run_base')
      expect(r.retestRunId).toBe('run_1')
      expect(String(r.id)).toMatch(/^rts_/)
    })
  })

  it('无标量指标时 baseline 建议 outcome 按 fingerprint→四态兜底写入', async () => {
    // 无 validationSpec + 无 probe/gsc 证据 → buildMetricPair 无从构建，回退纯四态。
    const deps = makeDeps({
      getFindings: vi.fn(async (rid: string) => (rid === 'run_base' ? baselineFindings : retestFindings)),
      getRecommendations: vi.fn(async (rid: string) =>
        rid === 'run_base'
          ? [
              { id: 'rec_b1', runId: 'run_base', findingId: 'f_b1', validationSpec: null },
              { id: 'rec_b2', runId: 'run_base', findingId: 'f_b2', validationSpec: null },
            ]
          : [],
      ),
      setRecommendationOutcome: vi.fn(async () => undefined),
      createRetestSnapshots: vi.fn(async (r: unknown[]) => r),
    })
    const { args } = makeArgs({ baselineRunId: 'run_base' })

    await generateFindingsHandler(args, asDeps(deps))

    // rec_b1→f_b1→fp_1 resolved → effective；rec_b2→f_b2→fp_2 persistent → ineffective
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b1', 'effective')
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b2', 'ineffective')
    expect(deps.setRecommendationOutcome).toHaveBeenCalledTimes(2)
  })

  it('P3 建议按 finding 关键词 GSC impressions 上升 → effective（真标量压过四态）', async () => {
    const deps = makeRetestDeps()
    const { args } = makeArgs({ baselineRunId: 'run_base' })
    await generateFindingsHandler(args, asDeps(deps))
    // rec_b1 目标 widget：100→300 增 → effective
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b1', 'effective')
  })

  it('P3 建议：目标 finding 两轮 persistent(四态=ineffective) 但目标词 impressions 上升 → effective（锁死 GSC 整链）', async () => {
    // 分叉用例（独立局部 fixtures，不碰共享 baselineFindings/retestFindings/baseRecs）：
    // 目标 finding 的 fingerprint 两轮都出现 → 四态=persistent → 兜底会给 ineffective；
    // 但该 finding 的目标词 gizmo 在 GSC 两轮 impressions 100→300 上升。
    // 断言 outcome=effective——此结果【只可能】来自 GSC 真标量（四态给的是 ineffective），
    // 故本用例真正锁死 evidence→parseGscKeywordMetrics→buildMetricPair(gsc)→computeOutcome 整链：
    // 一旦 GSC wiring 静默失效（buildMetricPair 误返 null），outcome 会回退 ineffective，本断言即失败。
    const targetFinding = (id: string, runId: string) => ({
      id, runId, fingerprint: 'fp_gsc_lock', severity: 'high', pillar: 'P3', title: 'G', side: 'seo',
      claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'],
      status: 'open', dismissedAt: null, dismissReason: null, metricTarget: { keywords: ['gizmo'] },
    })
    const gizmoEv = (id: string, impressions: number) => ({
      id, type: 'gsc', claimLevel: 'L4', source: 'gsc', sitePageId: null, rawText: '',
      payload: { dimension: 'query', rows: [{ keys: ['gizmo'], clicks: 1, impressions, ctr: 0.01, position: 6 }] },
    })
    const deps = makeDeps({
      getFindings: vi.fn(async (rid: string) =>
        rid === 'run_base' ? [targetFinding('f_gb', 'run_base')] : [targetFinding('f_gr', 'run_1')],
      ),
      getRecommendations: vi.fn(async (rid: string) =>
        rid === 'run_base'
          ? [{ id: 'rec_gsc', runId: 'run_base', findingId: 'f_gb', validationSpec: { metricSource: 'gsc', metric: 'impressions', scope: 'keywords', direction: 'increase', windowDays: 28 } }]
          : [],
      ),
      getRunEvidence: vi.fn(async (rid: string) => [rid === 'run_base' ? gizmoEv('g_b', 100) : gizmoEv('g_r', 300)]),
      setRecommendationOutcome: vi.fn(async () => undefined),
      createRetestSnapshots: vi.fn(async (rows: unknown[]) => rows),
    })
    const { args } = makeArgs({ baselineRunId: 'run_base' })

    await generateFindingsHandler(args, asDeps(deps))

    // effective 只能来自 GSC 标量；四态 persistent 兜底会给 ineffective。
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_gsc', 'effective')
  })

  it('P5 建议 probe brand_presence 上升 → effective（翻盘 fp_2 persistent 的四态 ineffective）', async () => {
    const deps = makeRetestDeps()
    const { args } = makeArgs({ baselineRunId: 'run_base' })
    await generateFindingsHandler(args, asDeps(deps))
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b2', 'effective')
  })

  it('基线全 branded=false + 回测有 branded=true → probe 口径不可比，rec_b2 outcome=unknown（不再被真标量翻盘为 effective）', async () => {
    // 缺陷1 守卫延伸（retest-delta.ts computeOutcome 的 comparable 参数）：migration 0008 场景——
    // 基线 run 的 prompts 全部 branded=false（未回填），回测 run 已正确标注 branded=true。
    // checkUnbrandedComparability 命中信号 A → computeOutcome 对 probe 口径短路为 'unknown'，
    // 不再让 presence 2/10→5/10 的表面「上升」翻盘成 effective（对照上面 P5 用例的可比场景）。
    const deps = makeRetestDeps({
      getRunPrompts: vi.fn(async (rid: string) =>
        rid === 'run_base'
          ? [{ id: 'p_1', text: 'best tool?', priority: 0, branded: false }]
          : [{ id: 'p_1', text: 'best brand tool?', priority: 0, branded: true }],
      ),
    })
    const { args } = makeArgs({ baselineRunId: 'run_base' })

    await generateFindingsHandler(args, asDeps(deps))

    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b2', 'unknown')
    // rec_b1（GSC 口径，不受 probe 口径守卫影响）行为不回归，仍是 effective。
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b1', 'effective')

    // 验证依据（非臆断）：F3 rule-stats 的 aggregateRuleStats 按 outcome !== 'unknown' 过滤
    // （lib/diagnosis/rule-stats.ts:76），用真实实现复核——'unknown' 样本不进 ineffective 率统计，
    // 不会被误判成 modify_threshold 信号。
    const drafts = aggregateRuleStats(
      [],
      [{ id: 'rec_b2', ruleId: 'G_probe_rule', outcome: 'unknown' }],
      { nMin: 1 },
    )
    expect(drafts).toEqual([])
  })

  it('探针口径可比时（两轮 branded 计数、parserVersion 均一致）行为不回归：presence 上升仍给 effective', async () => {
    // 对照用例：显式验证「可比」分支未被新守卫误伤——makeRetestDeps 默认两轮 getRunPrompts
    // 都不带 branded 标注（均按 0 处理），comparable 恒为 true，与上面的 P5 既有用例同源但独立重申。
    const deps = makeRetestDeps()
    const { args } = makeArgs({ baselineRunId: 'run_base' })
    await generateFindingsHandler(args, asDeps(deps))
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b2', 'effective')
  })

  it('retest_snapshots 含 probe 品牌指标行', async () => {
    const deps = makeRetestDeps()
    const { args } = makeArgs({ baselineRunId: 'run_base' })
    await generateFindingsHandler(args, asDeps(deps))
    const snapRows = deps.createRetestSnapshots.mock.calls[0][0] as Array<Record<string, string>>
    const names = snapRows.map((r) => r.metricName)
    expect(names).toContain('probe.brand_presence')
  })

  it('无 baselineRunId 时不触发回测 delta（保持原行为）', async () => {
    const deps = makeRetestDeps()
    const { args } = makeArgs()

    const result = await generateFindingsHandler(args, asDeps(deps))

    expect(result).toEqual({ status: 'reviewing', findings: 2 })
    expect(deps.createRetestSnapshots).not.toHaveBeenCalled()
    expect(deps.setRecommendationOutcome).not.toHaveBeenCalled()
    // 回测专用读取也不应发生
    expect(deps.getFindings).not.toHaveBeenCalled()
    expect(deps.getRecommendations).not.toHaveBeenCalled()
  })
})
