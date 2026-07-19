import { describe, it, expect, vi, beforeEach } from 'vitest'
import { projects } from '@/db/schema'

const inserts: { table: unknown; values: Record<string, unknown> }[] = []
const { getProjectByDomainMock, getProjectSettingsMock } = vi.hoisted(() => ({
  getProjectByDomainMock: vi.fn(),
  getProjectSettingsMock: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        inserts.push({ table, values: v })
        return {
          onConflictDoNothing: () => ({ returning: async () => [v] }),
          returning: async () => [v],
        }
      },
    }),
  },
}))

vi.mock('@/lib/repositories', () => ({
  getProjectByDomain: getProjectByDomainMock,
  getProjectSettings: getProjectSettingsMock,
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
    getProjectByDomainMock.mockReset()
    getProjectByDomainMock.mockResolvedValue(undefined)
    getProjectSettingsMock.mockReset()
    getProjectSettingsMock.mockResolvedValue(undefined)
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

  it('复用已有的同域名项目，不创建重复项目，并返回项目级配置快照', async () => {
    getProjectByDomainMock.mockResolvedValue({ id: 'proj_existing', domain: 'https://example.com/' })
    getProjectSettingsMock.mockResolvedValue({
      projectId: 'proj_existing',
      gscConnected: true,
      gscSiteUrl: 'sc-domain:example.com',
      defaultModels: ['Perplexity'],
    })

    const res = await post({ domain: 'example.com' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: 'proj_existing',
      domain: 'https://example.com/',
      reused: true,
      settings: {
        gscConnected: true,
        gscSiteUrl: 'sc-domain:example.com',
        defaultModels: ['Perplexity'],
      },
    })
    expect(inserts).toHaveLength(0)
  })
})
