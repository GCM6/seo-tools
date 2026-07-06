import { describe, it, expect, vi } from 'vitest'

const runs: Record<string, { id: string; status: string; failureReason: string | null } | null> = {
  run_1: { id: 'run_1', status: 'collecting', failureReason: null },
  run_done: { id: 'run_done', status: 'collected', failureReason: null },
  run_failed: { id: 'run_failed', status: 'failed', failureReason: 'fetch failed' },
  run_reviewing: { id: 'run_reviewing', status: 'reviewing', failureReason: null },
  run_diagnosing: { id: 'run_diagnosing', status: 'diagnosing', failureReason: null },
}

vi.mock('@/lib/repositories', () => ({
  getRun: vi.fn(async (id: string) => runs[id] ?? null),
}))

const subscribeMock = vi.fn(async () => ({
  [Symbol.asyncIterator]: async function* () {
    yield { data: { type: 'progress', pct: 10 } }
    yield { data: { type: 'done' } }
  },
}))

vi.mock('@inngest/realtime', async (importActual) => ({
  ...(await importActual<typeof import('@inngest/realtime')>()),
  subscribe: (...args: unknown[]) => subscribeMock(...(args as [])),
}))

import { GET } from './route'

describe('GET /runs/:id/events', () => {
  it('returns 404 for an unknown run', async () => {
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('subscribes and streams Realtime frames for a collecting run', async () => {
    subscribeMock.mockClear()
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'run_1' }) })
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const text = await res.text()
    expect(text).toContain('data: {"type":"progress","pct":10}')
    expect(text).toContain('data: {"type":"done"}')
    expect(subscribeMock).toHaveBeenCalledOnce()
  })

  it('short-circuits a finished run with a terminal frame without subscribing (no hang)', async () => {
    subscribeMock.mockClear()
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'run_done' }) })
    expect(await res.text()).toBe('data: {"type":"done"}\n\n')
    expect(subscribeMock).not.toHaveBeenCalled()
  })

  it('emits a failed frame for a failed run without subscribing', async () => {
    subscribeMock.mockClear()
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'run_failed' }) })
    expect(await res.text()).toBe('data: {"type":"failed","reason":"fetch failed"}\n\n')
    expect(subscribeMock).not.toHaveBeenCalled()
  })

  it('subscribes and streams Realtime frames for a diagnosing run', async () => {
    subscribeMock.mockClear()
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'run_diagnosing' }) })
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const text = await res.text()
    expect(text).toContain('data: {"type":"progress","pct":10}')
    expect(text).toContain('data: {"type":"done"}')
    expect(subscribeMock).toHaveBeenCalledOnce()
  })

  it('does not hang on a reviewing run (terminal frame, no subscribe)', async () => {
    subscribeMock.mockClear()
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'run_reviewing' }) })
    expect(await res.text()).toBe('data: {"type":"done"}\n\n')
    expect(subscribeMock).not.toHaveBeenCalled()
  })
})
