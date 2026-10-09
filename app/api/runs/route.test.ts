import { describe, it, expect, vi, beforeEach } from 'vitest'

const startCheckupMock = vi.fn()
vi.mock('@/lib/runs/start-checkup', () => ({ startCheckup: (...a: unknown[]) => startCheckupMock(...a) }))

import { POST } from './route'

const post = (body: unknown) =>
  POST(new Request('http://x/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('POST /api/runs', () => {
  beforeEach(() => startCheckupMock.mockReset())

  it('缺 projectId → 422，不发起体检', async () => {
    const res = await post({})
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'project_id_required' })
    expect(startCheckupMock).not.toHaveBeenCalled()
  })

  it('成功 → 201 返回新体检，并要求补建会话', async () => {
    startCheckupMock.mockResolvedValueOnce({ ok: true, run: { id: 'run_new', status: 'collecting' } })
    const res = await post({ projectId: 'proj_1', runType: 'retest' })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'run_new', status: 'collecting' })
    expect(startCheckupMock).toHaveBeenCalledWith({ projectId: 'proj_1', legacySession: true })
  })

  it.each([
    [{ ok: false, status: 404, error: 'not_found' }, 404, { error: 'not_found' }],
    [{ ok: false, status: 422, error: 'category_required', projectId: 'proj_1' }, 422, { error: 'category_required', projectId: 'proj_1' }],
    [{ ok: false, status: 409, error: 'run_in_progress', runId: 'run_busy' }, 409, { error: 'run_in_progress', runId: 'run_busy' }],
    [{ ok: false, status: 503, error: 'dispatch_failed', runId: 'run_x' }, 503, { error: 'dispatch_failed', runId: 'run_x' }],
  ])('失败结果原样映射：%j', async (result, status, body) => {
    startCheckupMock.mockResolvedValueOnce(result)
    const res = await post({ projectId: 'proj_1' })
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual(body)
  })
})
