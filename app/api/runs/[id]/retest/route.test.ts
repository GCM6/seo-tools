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

const getRunMock = vi.fn(async (id: string) =>
  id === 'run_base'
    ? { id: 'run_base', projectId: 'proj_1', runType: 'baseline', status: 'reviewing', protocolVersion: 'v3' }
    : undefined,
)
const getProjectMock = vi.fn(async (id: string) =>
  id === 'proj_1' ? { id: 'proj_1', domain: 'https://example.com/' } : null,
)
const markRunStatusMock = vi.fn(async () => undefined)
const findActiveRunMock = vi.fn(async () => undefined as { id: string; status: string } | undefined)

vi.mock('@/lib/repositories', () => ({
  getRun: (id: string) => getRunMock(id),
  getProject: (id: string) => getProjectMock(id),
  markRunStatus: (...args: unknown[]) => markRunStatusMock(...(args as [])),
  findActiveRun: (id: string) => findActiveRunMock(id),
}))

const sendMock = vi.fn(async () => ({ ids: ['evt_1'] }))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => sendMock(...(args as [])) },
}))

import { POST } from './route'
import { COLLECT_REQUESTED_EVENT } from '@/lib/inngest/events'

function post(id: string) {
  return POST(new Request(`http://x/api/runs/${id}/retest`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  })
}

describe('POST /api/runs/[id]/retest', () => {
  beforeEach(() => {
    insertedRuns.length = 0
    sendMock.mockReset().mockResolvedValue({ ids: ['evt_1'] })
    markRunStatusMock.mockClear()
    findActiveRunMock.mockReset().mockResolvedValue(undefined)
  })

  it('returns 404 when the baseline run does not exist', async () => {
    const res = await post('run_nope')
    expect(res.status).toBe(404)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('creates a collecting retest run inheriting protocol and dispatches collect with baselineRunId', async () => {
    const res = await post('run_base')
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.baselineRunId).toBe('run_base')
    expect(body.retest.runType).toBe('retest')
    expect(body.retest.status).toBe('collecting')
    // 同协议：继承 baseline 的 project 与 protocol_version
    expect(body.retest.projectId).toBe('proj_1')
    expect(body.retest.protocolVersion).toBe('v3')

    // 派发 collect 事件，第三参穿入 baseline id（触发同协议重跑 + 收尾算 delta）
    expect(sendMock).toHaveBeenCalledOnce()
    const [event] = sendMock.mock.calls[0] as unknown[] as [{ name: string; data: { baselineRunId?: string; url: string } }]
    expect(event.name).toBe(COLLECT_REQUESTED_EVENT)
    expect(event.data.baselineRunId).toBe('run_base')
    expect(event.data.url).toBe('https://example.com/')
  })

  it('marks the retest run failed and returns 503 when dispatch fails', async () => {
    sendMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:8288'))
    const res = await post('run_base')

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: 'dispatch_failed' })

    expect(markRunStatusMock).toHaveBeenCalledOnce()
    const [runId, status] = markRunStatusMock.mock.calls[0] as unknown[] as [string, string]
    expect(runId).toBe((insertedRuns[0] as { id: string }).id)
    expect(status).toBe('failed')
  })

  // 同项目并发保护（spec §2.3）：已有进行中 run 时拒绝发起回测，不插入不派发。
  it('returns 409 run_in_progress when the project already has an active run', async () => {
    findActiveRunMock.mockResolvedValue({ id: 'run_active', status: 'diagnosing' })
    const res = await post('run_base')

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'run_in_progress', runId: 'run_active' })
    expect(insertedRuns.length).toBe(0)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
