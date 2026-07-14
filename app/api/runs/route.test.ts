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

const getProjectMock = vi.fn(async (id: string) =>
  id === 'proj_1' ? { id: 'proj_1', domain: 'https://example.com/' } : null,
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
  it('returns 409 run_in_progress when the project already has an active run', async () => {
    findActiveRunMock.mockResolvedValue({ id: 'run_active', status: 'collecting' })
    const res = await post({ projectId: 'proj_1', runType: 'baseline' })

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'run_in_progress', runId: 'run_active' })
    expect(insertedRuns.length).toBe(0)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
