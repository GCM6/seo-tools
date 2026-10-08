import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertedRuns: Record<string, unknown>[] = []

vi.mock('@/db/client', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          insertedRuns.push(v)
          return [v]
        },
      }),
    }),
  },
}))

// 默认项目品类/市场合规（SP-A §3.5 闸门放行）；闸门用例里用 mockImplementationOnce 覆盖。
type ProjectStub = { id: string; domain: string; industry: string; market: string }
const getProjectMock = vi.fn(async (id: string): Promise<ProjectStub | null> =>
  id === 'proj_1' ? { id: 'proj_1', domain: 'https://example.com/', industry: 'document metadata removal tool', market: 'global-en' } : null,
)
const markRunStatusMock = vi.fn(async (...args: unknown[]) => {
  void args
  return undefined
})
const findActiveRunMock = vi.fn(async (...args: unknown[]) => {
  void args
  return undefined as { id: string; status: string } | undefined
})

vi.mock('@/lib/repositories', () => ({
  getProject: (id: string) => getProjectMock(id),
  markRunStatus: (...args: unknown[]) => markRunStatusMock(...(args as [])),
  findActiveRun: (id: string) => findActiveRunMock(id),
}))

const sendMock = vi.fn(async (...args: unknown[]) => {
  void args
  return { ids: ['evt_1'] }
})

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => sendMock(...(args as [])) },
}))

import { POST } from './route'
import { COLLECT_REQUESTED_EVENT } from '@/lib/inngest/events'

function post(body: unknown) {
  return POST(
    new Request('http://x/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/runs', () => {
  beforeEach(() => {
    insertedRuns.length = 0
    sendMock.mockReset().mockResolvedValue({ ids: ['evt_1'] })
    markRunStatusMock.mockClear()
    findActiveRunMock.mockReset().mockResolvedValue(undefined)
  })

  it('returns 422 when projectId is missing', async () => {
    const res = await post({})
    expect(res.status).toBe(422)
  })

  it('returns 404 for an unknown project', async () => {
    const res = await post({ projectId: 'proj_nope' })
    expect(res.status).toBe(404)
  })

  it('creates a collecting run and dispatches the collect event', async () => {
    const res = await post({ projectId: 'proj_1', runType: 'baseline' })
    expect(res.status).toBe(201)
    const run = await res.json()
    expect(run.status).toBe('collecting')
    expect(sendMock).toHaveBeenCalledOnce()
    const [event] = sendMock.mock.calls[0] as unknown[] as [{ name: string }]
    expect(event.name).toBe(COLLECT_REQUESTED_EVENT)
  })

  // 与回测路由同语义：创建即写 startedAt。项目列表的「最近诊断」和回测锚点按它排序，
  // 基线不写会被唯一带时间的回测抢走「最近一次」。
  it('writes startedAt on the new baseline run', async () => {
    await post({ projectId: 'proj_1', runType: 'baseline' })
    const startedAt = insertedRuns.at(-1)?.startedAt
    expect(typeof startedAt).toBe('string')
    expect(Number.isNaN(Date.parse(String(startedAt)))).toBe(false)
  })

  // 核心回归：本地 Inngest dev server 未启动时 send 会抛错。
  // 此前该异常未处理 → 500 且 run 永远卡在 collecting（僵尸 run）。
  it('marks the run failed and returns 503 dispatch_failed when event dispatch fails', async () => {
    sendMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:8288'))
    const res = await post({ projectId: 'proj_1', runType: 'baseline' })

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: 'dispatch_failed' })

    // run 不能留在 collecting：必须标记为 failed 并写入原因
    expect(markRunStatusMock).toHaveBeenCalledOnce()
    const [runId, status, extra] = markRunStatusMock.mock.calls[0] as unknown[] as [
      string,
      string,
      { failureReason?: string | null },
    ]
    expect(runId).toBe((insertedRuns[0] as { id: string }).id)
    expect(status).toBe('failed')
    expect(extra?.failureReason).toBeTruthy()
  })

  // 同项目并发保护（spec §2.3）：已有进行中 run 时拒绝创建，不插入不派发。
  describe('SP-A §3.5 建 run 闸门：品类/市场无效不得启动（也就不触发任何付费采集）', () => {
    const legacy = (over: Partial<ProjectStub>) =>
      getProjectMock.mockImplementationOnce(async () => ({
        id: 'proj_1', domain: 'https://example.com/', industry: 'document metadata removal tool', market: 'global-en', ...over,
      }))

    it.each([
      ['旧下拉默认行业', { industry: 'B2B SaaS · 项目协作' }],
      ['其他…', { industry: '其他…' }],
      ['空品类', { industry: '' }],
    ])('%s → 422 category_required，不建 run、不派发', async (_label, over) => {
      legacy(over)
      const res = await post({ projectId: 'proj_1' })
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({ error: 'category_required' })
      expect(insertedRuns).toHaveLength(0)
      expect(sendMock).not.toHaveBeenCalled()
    })

    it.each([
      ['旧英文显示文案', { market: 'English · Global' }],
      ['旧中文市场', { market: '中文 · 中国大陆' }],
      ['空市场', { market: '' }],
    ])('%s → 422 market_required', async (_label, over) => {
      legacy(over)
      const res = await post({ projectId: 'proj_1' })
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({ error: 'market_required' })
      expect(insertedRuns).toHaveLength(0)
    })
  })

  it('returns 409 run_in_progress when the project already has an active run', async () => {
    findActiveRunMock.mockResolvedValue({ id: 'run_active', status: 'collecting' })
    const res = await post({ projectId: 'proj_1', runType: 'baseline' })

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'run_in_progress', runId: 'run_active' })
    expect(insertedRuns.length).toBe(0)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
