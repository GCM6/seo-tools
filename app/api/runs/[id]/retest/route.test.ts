import { describe, it, expect, vi, beforeEach } from 'vitest'

const getRunMock = vi.fn()
const startCheckupMock = vi.fn()
vi.mock('@/lib/repositories', () => ({ getRun: (id: string) => getRunMock(id) }))
vi.mock('@/lib/runs/start-checkup', () => ({ startCheckup: (...a: unknown[]) => startCheckupMock(...a) }))

import { POST } from './route'

const call = (id: string) => POST(new Request(`http://x/api/runs/${id}/retest`, { method: 'POST' }), { params: Promise.resolve({ id }) })

describe('POST /api/runs/[id]/retest', () => {
  beforeEach(() => {
    getRunMock.mockReset()
    startCheckupMock.mockReset()
  })

  it('被点的体检不存在 → 404', async () => {
    getRunMock.mockResolvedValueOnce(undefined)
    expect((await call('run_x')).status).toBe(404)
    expect(startCheckupMock).not.toHaveBeenCalled()
  })

  it('对它所属项目发起体检，响应保持 { baselineRunId, retest } 形状', async () => {
    getRunMock.mockResolvedValueOnce({ id: 'run_old', projectId: 'proj_1' })
    startCheckupMock.mockResolvedValueOnce({ ok: true, run: { id: 'run_new', baselineRunId: 'run_anchor' } })
    const res = await call('run_old')
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ baselineRunId: 'run_anchor', retest: { id: 'run_new', baselineRunId: 'run_anchor' } })
    expect(startCheckupMock).toHaveBeenCalledWith({ projectId: 'proj_1' })
  })

  it('新协议（没有基线）时 baselineRunId 回落为被点的体检 id', async () => {
    getRunMock.mockResolvedValueOnce({ id: 'run_old', projectId: 'proj_1' })
    startCheckupMock.mockResolvedValueOnce({ ok: true, run: { id: 'run_new', baselineRunId: null } })
    expect((await (await call('run_old')).json()).baselineRunId).toBe('run_old')
  })

  it('闸门失败带 projectId（界面据此直链向导）', async () => {
    getRunMock.mockResolvedValueOnce({ id: 'run_old', projectId: 'proj_1' })
    startCheckupMock.mockResolvedValueOnce({ ok: false, status: 422, error: 'category_required', projectId: 'proj_1' })
    const res = await call('run_old')
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'category_required', projectId: 'proj_1' })
  })
})
