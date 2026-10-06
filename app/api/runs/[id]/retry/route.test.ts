import { describe, it, expect, vi, beforeEach } from 'vitest'

const okProject = { id: 'proj_1', domain: 'https://example.com/', industry: 'document metadata removal tool', market: 'global-en' }
const state: { run: { id: string; projectId: string; status: string; runType?: string } | null; sendThrows: boolean; project: typeof okProject; sends: number } = {
  run: { id: 'run_1', projectId: 'proj_1', status: 'failed' }, sendThrows: false, project: okProject, sends: 0,
}
const marks: { status: string }[] = []
vi.mock('@/lib/repositories', () => ({
  getRun: async () => state.run,
  getProject: async () => state.project,
  markRunStatus: async (_id: string, status: string) => { marks.push({ status }) },
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: async () => { state.sends++; if (state.sendThrows) throw new Error('dev server down') } },
}))

const { POST } = await import('./route')
const call = (id = 'run_1') => POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id }) })

describe('POST /api/runs/[id]/retry', () => {
  beforeEach(() => {
    marks.length = 0
    state.run = { id: 'run_1', projectId: 'proj_1', status: 'failed' }
    state.sendThrows = false
    state.project = okProject
    state.sends = 0
  })

  it('失败的回测 run → 409 retest_retry_unsupported，不改状态、不派发（重派事件会丢掉基线，变成不同协议；最终审查 F5-1）', async () => {
    state.run = { id: 'run_1', projectId: 'proj_1', status: 'failed', runType: 'retest' }
    const res = await call()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'retest_retry_unsupported', projectId: 'proj_1' })
    expect(marks).toEqual([])
    expect(state.sends).toBe(0)
  })

  it('run 不存在 → 404', async () => {
    state.run = null
    expect((await call()).status).toBe(404)
  })
  it('非 failed → 409 not_failed', async () => {
    state.run = { id: 'run_1', projectId: 'proj_1', status: 'collecting' }
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not_failed')
  })
  it('failed → 置 collecting 并重派，返回 ok', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(marks[0].status).toBe('collecting')
  })
  it('SP-A §3.5：项目市场无效 → 422 market_required，不改状态、不重派', async () => {
    state.project = { ...okProject, market: 'English · Global' }
    const res = await call()
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'market_required', projectId: 'proj_1' })
    expect(marks).toHaveLength(0)
  })
  it('派发失败 → 置 failed + 503', async () => {
    state.sendThrows = true
    const res = await call()
    expect(res.status).toBe(503)
    expect(marks.map((m) => m.status)).toEqual(['collecting', 'failed'])
  })
})
