import { describe, it, expect, vi } from 'vitest'

const rows = vi.hoisted(() => ({ list: [] as Record<string, unknown>[] }))
vi.mock('@/lib/repositories', () => ({ getEvidenceRawsByEvidenceId: async () => rows.list }))
const { GET } = await import('./route')
const call = (id: string) => GET(new Request('http://x'), { params: Promise.resolve({ id }) })

describe('GET /api/evidence/[id]/raw（SP-A §4.3：原文清单，不含正文）', () => {
  it('无原文 → 404 not_found', async () => {
    rows.list = []
    const res = await call('ev_1')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('返回每条原文的元数据与下钻链接，不回传压缩正文', async () => {
    rows.list = [{ id: 'raw_1', runId: 'run_1', sourceKey: 'dataforseo:labs', httpStatus: 200, contentType: 'application/json', byteLength: 10, truncated: false, sha256: 'abc', content: Buffer.from('x') }]
    const body = await (await call('ev_1')).json()
    expect(body.items).toEqual([{ id: 'raw_1', sourceKey: 'dataforseo:labs', httpStatus: 200, contentType: 'application/json', byteLength: 10, truncated: false, sha256: 'abc', href: '/api/runs/run_1/raw/raw_1' }])
  })
})
