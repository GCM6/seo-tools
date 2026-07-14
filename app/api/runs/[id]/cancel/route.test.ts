import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_CANCELLED_REASON } from '@/lib/runs/status'

const state: { run: { id: string; status: string } | null } = {
  run: { id: 'run_1', status: 'collecting' },
}
const marks: { id: string; status: string; extra?: { failureReason?: string; finishedAt?: string } }[] = []

vi.mock('@/lib/repositories', () => ({
  getRun: async () => state.run,
  markRunStatus: async (id: string, status: string, extra?: { failureReason?: string; finishedAt?: string }) => {
    marks.push({ id, status, extra })
  },
}))

const { POST } = await import('./route')
const call = (id = 'run_1') => POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id }) })

describe('POST /api/runs/[id]/cancel', () => {
  beforeEach(() => {
    marks.length = 0
    state.run = { id: 'run_1', status: 'collecting' }
  })

  it('returns 404 for an unknown run', async () => {
    state.run = null
    expect((await call()).status).toBe(404)
  })

  it.each(['failed', 'reviewing', 'collected'])('rejects a non-running %s run', async (status) => {
    state.run = { id: 'run_1', status }
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not_running')
    expect(marks).toEqual([])
  })

  it.each(['collecting', 'diagnosing'])('stops a %s run', async (status) => {
    state.run = { id: 'run_1', status }
    const res = await call()
    expect(res.status).toBe(200)
    expect(marks).toHaveLength(1)
    expect(marks[0]).toMatchObject({
      id: 'run_1',
      status: 'failed',
      extra: { failureReason: RUN_CANCELLED_REASON },
    })
    expect(marks[0].extra?.finishedAt).toEqual(expect.any(String))
  })
})
