import { describe, it, expect, vi } from 'vitest'
import { startCheckup, type StartCheckupDeps } from './start-checkup'
import type { PriorRun } from './protocol'

const project = {
  id: 'proj_1', domain: 'https://metadocu.com/', industry: 'document metadata removal tool', market: 'global-en',
  language: 'en', competitors: [] as string[], ownerId: 'local', nextRetestDueAt: null, createdAt: '', updatedAt: '',
}

// 每个依赖都是 vi.fn：用映射类型把 mock 属性并进各依赖的类型（交叉 Record<string, Mock> 时具名属性会盖掉索引签名，读不到 .mock）。
type MockedDeps = { [K in keyof StartCheckupDeps]: StartCheckupDeps[K] & ReturnType<typeof vi.fn> }

function makeDeps(over: Partial<StartCheckupDeps> = {}): MockedDeps {
  const inserted: Record<string, unknown>[] = []
  return {
    getProject: vi.fn(async (id: string) => (id === 'proj_1' ? project : undefined)),
    getProjectSettings: vi.fn(async () => ({ defaultModels: ['deepseek'], brandAliases: [], targetKeywords: [] })),
    getConfirmedCompetitors: vi.fn(async () => []),
    getProjectRuns: vi.fn(async (): Promise<PriorRun[]> => []),
    findActiveRun: vi.fn(async () => undefined),
    insertRun: vi.fn(async (row: Record<string, unknown>) => {
      inserted.push(row)
      return { ...row } as never
    }),
    markRunStatus: vi.fn(async () => undefined) as never,
    sendCollect: vi.fn(async () => ({ ids: ['evt_1'] })),
    createLegacySession: vi.fn(async () => undefined),
    now: () => '2026-10-09T00:00:00.000Z',
    ...over,
  } as never
}

describe('startCheckup', () => {
  it('项目不存在 → 404', async () => {
    expect(await startCheckup({ projectId: 'nope' }, makeDeps())).toMatchObject({ ok: false, status: 404, error: 'not_found' })
  })

  it('品类为空 → 422 category_required，带 projectId，不建 run 不派发', async () => {
    const deps = makeDeps({ getProject: vi.fn(async () => ({ ...project, industry: '' })) as never })
    expect(await startCheckup({ projectId: 'proj_1' }, deps)).toMatchObject({ ok: false, status: 422, error: 'category_required', projectId: 'proj_1' })
    expect(deps.insertRun).not.toHaveBeenCalled()
  })

  it('已有进行中的体检 → 409，带 runId', async () => {
    const deps = makeDeps({ findActiveRun: vi.fn(async () => ({ id: 'run_busy' })) as never })
    expect(await startCheckup({ projectId: 'proj_1' }, deps)).toMatchObject({ ok: false, status: 409, error: 'run_in_progress', runId: 'run_busy' })
  })

  it('首次体检 → 新协议：runType baseline、写协议指纹与开始时间，派发时不带基线', async () => {
    const deps = makeDeps()
    const res = await startCheckup({ projectId: 'proj_1' }, deps)
    expect(res.ok).toBe(true)
    const row = deps.insertRun.mock.calls[0][0] as Record<string, unknown>
    expect(row).toMatchObject({ projectId: 'proj_1', runType: 'baseline', status: 'collecting', startedAt: '2026-10-09T00:00:00.000Z', baselineRunId: null })
    expect(String(row.id)).toMatch(/^run_/)
    expect(String(row.protocolHash)).toMatch(/^[0-9a-f]{64}$/)
    expect(deps.sendCollect.mock.calls[0][2]).toBeUndefined()
  })

  it('输入没变 → 沿用上次协议：runType retest、基线为协议起点、派发带基线、沿用起点的 protocolVersion', async () => {
    const first = makeDeps()
    await startCheckup({ projectId: 'proj_1' }, first)
    const hash = (first.insertRun.mock.calls[0][0] as { protocolHash: string }).protocolHash
    const prior: PriorRun[] = [{ id: 'run_a', runType: 'baseline', status: 'output', protocolHash: hash, baselineRunId: null, protocolVersion: 'v2', startedAt: '2026-10-01T00:00:00.000Z', finishedAt: null }]
    const deps = makeDeps({ getProjectRuns: vi.fn(async () => prior) as never })
    await startCheckup({ projectId: 'proj_1' }, deps)
    expect(deps.insertRun.mock.calls[0][0]).toMatchObject({ runType: 'retest', baselineRunId: 'run_a', protocolHash: hash, protocolVersion: 'v2' })
    expect(deps.sendCollect.mock.calls[0][2]).toBe('run_a')
  })

  it('改了竞品确认 → 新协议', async () => {
    const first = makeDeps()
    await startCheckup({ projectId: 'proj_1' }, first)
    const hash = (first.insertRun.mock.calls[0][0] as { protocolHash: string }).protocolHash
    const prior: PriorRun[] = [{ id: 'run_a', runType: 'baseline', status: 'output', protocolHash: hash, baselineRunId: null, protocolVersion: 'v2', startedAt: '2026-10-01T00:00:00.000Z', finishedAt: null }]
    const deps = makeDeps({
      getProjectRuns: vi.fn(async () => prior) as never,
      getConfirmedCompetitors: vi.fn(async () => [{ domain: 'metadata2go.com' }]) as never,
    })
    await startCheckup({ projectId: 'proj_1' }, deps)
    expect(deps.insertRun.mock.calls[0][0]).toMatchObject({ runType: 'baseline', baselineRunId: null })
  })

  it('派发失败 → 体检标 failed、返回 503 dispatch_failed', async () => {
    const deps = makeDeps({ sendCollect: vi.fn(async () => { throw new Error('inngest down') }) as never })
    const res = await startCheckup({ projectId: 'proj_1' }, deps)
    expect(res).toMatchObject({ ok: false, status: 503, error: 'dispatch_failed' })
    expect(deps.markRunStatus).toHaveBeenCalledWith(expect.stringMatching(/^run_/), 'failed', expect.objectContaining({ failureReason: '采集事件派发失败：inngest down' }))
  })

  it('legacySession 且没有会话 → 补建会话；带 analysisSessionId → 写入 run、不另建会话', async () => {
    const a = makeDeps()
    await startCheckup({ projectId: 'proj_1', legacySession: true }, a)
    expect(a.createLegacySession).toHaveBeenCalledTimes(1)
    const b = makeDeps()
    await startCheckup({ projectId: 'proj_1', legacySession: true, analysisSessionId: 'sess_1' }, b)
    expect(b.createLegacySession).not.toHaveBeenCalled()
    expect(b.insertRun.mock.calls[0][0]).toMatchObject({ analysisSessionId: 'sess_1' })
  })

  it('补建会话失败不阻断体检', async () => {
    const deps = makeDeps({ createLegacySession: vi.fn(async () => { throw new Error('0013 missing') }) as never })
    expect((await startCheckup({ projectId: 'proj_1', legacySession: true }, deps)).ok).toBe(true)
  })
})

// 以下用例承接旧 app/api/runs 与 app/api/runs/[id]/retest 路由测试里的行为覆盖（路由测试已改为只测参数与结果映射）。
describe('startCheckup 建体检闸门（SP-A §3.5：品类/市场无效不得启动，也就不触发任何付费采集）', () => {
  const withProject = (over: Partial<typeof project>) => makeDeps({ getProject: vi.fn(async () => ({ ...project, ...over })) as never })

  it.each([
    ['旧下拉默认行业', { industry: 'B2B SaaS · 项目协作' }],
    ['其他…', { industry: '其他…' }],
    ['空品类', { industry: '' }],
  ])('%s → 422 category_required，带 projectId，不建 run、不派发', async (_label, over) => {
    const deps = withProject(over)
    expect(await startCheckup({ projectId: 'proj_1' }, deps)).toEqual({ ok: false, status: 422, error: 'category_required', projectId: 'proj_1' })
    expect(deps.insertRun).not.toHaveBeenCalled()
    expect(deps.sendCollect).not.toHaveBeenCalled()
  })

  it.each([
    ['旧英文显示文案', { market: 'English · Global' }],
    ['旧中文市场', { market: '中文 · 中国大陆' }],
    ['空市场', { market: '' }],
  ])('%s → 422 market_required，不建 run、不派发', async (_label, over) => {
    const deps = withProject(over)
    expect(await startCheckup({ projectId: 'proj_1' }, deps)).toEqual({ ok: false, status: 422, error: 'market_required', projectId: 'proj_1' })
    expect(deps.insertRun).not.toHaveBeenCalled()
    expect(deps.sendCollect).not.toHaveBeenCalled()
  })

  it('并发保护：已有进行中的体检 → 409，不建 run、不派发', async () => {
    const deps = makeDeps({ findActiveRun: vi.fn(async () => ({ id: 'run_active' })) as never })
    expect(await startCheckup({ projectId: 'proj_1' }, deps)).toEqual({ ok: false, status: 409, error: 'run_in_progress', runId: 'run_active' })
    expect(deps.insertRun).not.toHaveBeenCalled()
    expect(deps.sendCollect).not.toHaveBeenCalled()
  })
})

describe('startCheckup 派发细节', () => {
  it('以项目 domain 作为采集入口 url 派发，派发的是刚建的那条 run', async () => {
    const deps = makeDeps()
    const res = await startCheckup({ projectId: 'proj_1' }, deps)
    expect(deps.sendCollect).toHaveBeenCalledTimes(1)
    const [run, url] = deps.sendCollect.mock.calls[0] as unknown as [{ id: string }, string]
    expect(url).toBe('https://metadocu.com/')
    expect(res.ok && run.id === res.run.id).toBe(true)
  })

  it('派发失败 → 失败信息与完成时间一并写入，返回的 runId 就是被标 failed 的那条', async () => {
    const deps = makeDeps({ sendCollect: vi.fn(async () => { throw new Error('ECONNREFUSED 127.0.0.1:8288') }) as never })
    const res = await startCheckup({ projectId: 'proj_1' }, deps)
    const insertedId = (deps.insertRun.mock.calls[0][0] as { id: string }).id
    expect(res).toEqual({ ok: false, status: 503, error: 'dispatch_failed', runId: insertedId })
    expect(deps.markRunStatus).toHaveBeenCalledOnce()
    expect(deps.markRunStatus).toHaveBeenCalledWith(insertedId, 'failed', {
      failureReason: '采集事件派发失败：ECONNREFUSED 127.0.0.1:8288',
      finishedAt: '2026-10-09T00:00:00.000Z',
    })
  })

  it('沿用协议时回测的 protocolVersion 取协议起点的，而非默认值', async () => {
    const first = makeDeps()
    await startCheckup({ projectId: 'proj_1' }, first)
    const hash = (first.insertRun.mock.calls[0][0] as { protocolHash: string }).protocolHash
    const prior: PriorRun[] = [
      { id: 'run_a', runType: 'baseline', status: 'reviewing', protocolHash: hash, baselineRunId: null, protocolVersion: 'v3', startedAt: '2026-10-01T00:00:00.000Z', finishedAt: null },
      { id: 'run_b', runType: 'retest', status: 'output', protocolHash: hash, baselineRunId: 'run_a', protocolVersion: 'v3', startedAt: '2026-10-05T00:00:00.000Z', finishedAt: null },
    ]
    const deps = makeDeps({ getProjectRuns: vi.fn(async () => prior) as never })
    await startCheckup({ projectId: 'proj_1' }, deps)
    expect(deps.insertRun.mock.calls[0][0]).toMatchObject({ runType: 'retest', baselineRunId: 'run_a', protocolVersion: 'v3' })
  })

  it('新协议时不带 protocolVersion，交给表默认值', async () => {
    const deps = makeDeps()
    await startCheckup({ projectId: 'proj_1' }, deps)
    expect(deps.insertRun.mock.calls[0][0]).not.toHaveProperty('protocolVersion')
  })
})
