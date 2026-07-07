import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { run: { id: string; projectId: string; status: string } | null; sendThrows: boolean } = {
  run: { id: 'run_1', projectId: 'proj_1', status: 'failed' }, sendThrows: false,
}
const marks: { status: string }[] = []
vi.mock('@/lib/repositories', () => ({
  getRun: async () => state.run,
  getProject: async () => ({ id: 'proj_1', domain: 'https://example.com/' }),
  markRunStatus: async (_id: string, status: string) => { marks.push({ status }) },
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: async () => { if (state.sendThrows) throw new Error('dev server down') } },
}))

const { POST } = await import('./route')
const call = (id = 'run_1') => POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id }) })

describe('POST /api/runs/[id]/retry', () => {
  beforeEach(() => {
    marks.length = 0
    state.run = { id: 'run_1', projectId: 'proj_1', status: 'failed' }
    state.sendThrows = false
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
  it('派发失败 → 置 failed + 503', async () => {
    state.sendThrows = true
    const res = await call()
    expect(res.status).toBe(503)
    expect(marks.map((m) => m.status)).toEqual(['collecting', 'failed'])
  })
})
