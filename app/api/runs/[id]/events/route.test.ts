import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/repositories', () => ({
  getRun: vi.fn(async (id: string) => (id === 'run_1' ? { id: 'run_1' } : null)),
}))

vi.mock('@inngest/realtime', async (importActual) => ({
  ...(await importActual<typeof import('@inngest/realtime')>()),
  subscribe: vi.fn(async () => ({
    [Symbol.asyncIterator]: async function* () {
      yield { data: { type: 'progress', pct: 10 } }
      yield { data: { type: 'done' } }
    },
  })),
}))

import { GET } from './route'

describe('GET /runs/:id/events', () => {
  it('returns 404 for an unknown run', async () => {
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('streams Realtime messages as SSE frames', async () => {
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'run_1' }) })
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const text = await res.text()
    expect(text).toContain('data: {"type":"progress","pct":10}')
    expect(text).toContain('data: {"type":"done"}')
  })
})
