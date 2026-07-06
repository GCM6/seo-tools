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
    { id: 'f_b1', runId: 'run_base', fingerprint: 'fp_1', severity: 'high', pillar: 'P1', title: 'A', side: 'technical', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null },
    { id: 'f_b2', runId: 'run_base', fingerprint: 'fp_2', severity: 'high', pillar: 'P1', title: 'B', side: 'seo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null },
  ]
  const retestFindings = [
    { id: 'f_r2', runId: 'run_1', fingerprint: 'fp_2', severity: 'high', pillar: 'P1', title: 'B', side: 'seo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null },
    { id: 'f_r3', runId: 'run_1', fingerprint: 'fp_3', severity: 'mid', pillar: 'P2', title: 'C', side: 'seo', claimType: 'inferred', confidence: '推断', description: '', evidenceRefs: ['ev_1'], status: 'open', dismissedAt: null, dismissReason: null },
  ]
  const baseRecs = [
    { id: 'rec_b1', runId: 'run_base', findingId: 'f_b1', validationSpec: null },
    { id: 'rec_b2', runId: 'run_base', findingId: 'f_b2', validationSpec: null },
  ]

  function makeRetestDeps() {
    return makeDeps({
      getFindings: vi.fn(async (rid: string) => (rid === 'run_base' ? baselineFindings : retestFindings)),
      getRecommendations: vi.fn(async (rid: string) => (rid === 'run_base' ? baseRecs : [])),
      createRetestSnapshots: vi.fn(async (rows: unknown[]) => rows),
      setRecommendationOutcome: vi.fn(async () => undefined),
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

  it('baseline 建议 outcome 按 fingerprint→四态对齐写入（恒由 delta 计算）', async () => {
    const deps = makeRetestDeps()
    const { args } = makeArgs({ baselineRunId: 'run_base' })

    await generateFindingsHandler(args, asDeps(deps))

    // rec_b1→f_b1→fp_1 resolved → effective；rec_b2→f_b2→fp_2 persistent → ineffective
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b1', 'effective')
    expect(deps.setRecommendationOutcome).toHaveBeenCalledWith('rec_b2', 'ineffective')
    expect(deps.setRecommendationOutcome).toHaveBeenCalledTimes(2)
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
