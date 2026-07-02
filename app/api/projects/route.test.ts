import { describe, it, expect, vi, beforeEach } from 'vitest'
import { projects } from '@/db/schema'

const inserts: { table: unknown; values: Record<string, unknown> }[] = []

vi.mock('@/db/client', () => ({
  db: {
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        inserts.push({ table, values: v })
        return { returning: async () => [v] }
      },
    }),
  },
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(
    new Request('http://x/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/projects', () => {
  beforeEach(() => {
    inserts.length = 0
  })

  it('returns 422 when domain is missing', async () => {
    expect((await post({})).status).toBe(422)
  })

  it('normalizes a bare domain and creates the project', async () => {
    const res = await post({ domain: 'example.com', language: 'zh' })
    expect(res.status).toBe(201)
    const project = inserts.find((i) => i.table === projects)?.values
    expect(project?.domain).toBe('https://example.com/')
  })

  // SoV 与探针解析都依赖竞品清单；表单收集的逗号分隔竞品必须规范化落库。
  it('persists competitors normalized from a comma-separated list', async () => {
    const res = await post({ domain: 'example.com', competitors: ' 竞品A, Competitor B ,, ' })
    expect(res.status).toBe(201)
    const project = inserts.find((i) => i.table === projects)?.values
    expect(project?.competitors).toEqual(['竞品A', 'Competitor B'])
  })

  it('accepts competitors already given as an array and drops blanks', async () => {
    await post({ domain: 'example.com', competitors: ['A', ' ', 'B'] })
    const project = inserts.find((i) => i.table === projects)?.values
    expect(project?.competitors).toEqual(['A', 'B'])
  })

  it('defaults competitors to an empty list', async () => {
    await post({ domain: 'example.com' })
    const project = inserts.find((i) => i.table === projects)?.values
    expect(project?.competitors).toEqual([])
  })
})
