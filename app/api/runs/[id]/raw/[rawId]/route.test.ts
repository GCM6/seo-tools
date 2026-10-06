import { describe, it, expect, vi } from 'vitest'
import { packRaw } from '@/lib/collection/raw-store'

const state = vi.hoisted(() => ({ row: undefined as Record<string, unknown> | undefined, calls: [] as unknown[][] }))
vi.mock('@/lib/repositories', () => ({ getEvidenceRawById: async (...args: unknown[]) => { state.calls.push(args); return state.row } }))
const { GET } = await import('./route')
const call = (id: string, rawId: string) => GET(new Request('http://x'), { params: Promise.resolve({ id, rawId }) })

describe('GET /api/runs/[id]/raw/[rawId]（SP-A §4.3：解压后的原文）', () => {
  it('不存在（或不属于该 run）→ 404', async () => {
    state.row = undefined
    const res = await call('run_1', 'raw_x')
    expect(res.status).toBe(404)
    expect(state.calls.at(-1)).toEqual(['run_1', 'raw_x'])
  })

  it('返回原文与原 content-type，响应头带截断标记与 sha256', async () => {
    const body = '{"status_code":40101}'
    const packed = packRaw({ status: 402, contentType: 'application/json', body })
    state.row = { id: 'raw_1', runId: 'run_1', contentType: 'application/json', ...packed }
    const res = await call('run_1', 'raw_1')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(body)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('x-raw-truncated')).toBe('false')
    expect(res.headers.get('x-raw-sha256')).toBe(packed.sha256)
  })
})
