import { describe, it, expect, vi, beforeEach } from 'vitest'
import { projects } from '@/db/schema'

const inserts: { table: unknown; values: Record<string, unknown> }[] = []
const { getProjectByDomainMock, getProjectSettingsMock, setTargetKeywordsMock, getTargetKeywordsMock } = vi.hoisted(() => ({
  getProjectByDomainMock: vi.fn(),
  getProjectSettingsMock: vi.fn(),
  setTargetKeywordsMock: vi.fn(async (...args: unknown[]) => { void args }),
  getTargetKeywordsMock: vi.fn(async (...args: unknown[]) => { void args; return [] as string[] }),
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
  setTargetKeywords: setTargetKeywordsMock,
  getTargetKeywords: getTargetKeywordsMock,
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
    setTargetKeywordsMock.mockClear()
    getTargetKeywordsMock.mockClear()
  })

  describe('SP-A §3.2/§3.3 输入校验', () => {
    it.each([
      [{ market: '中文 · 中国大陆' }, 'invalid_market'],
      [{ market: 'English · Global' }, 'invalid_market'],
      [{ industry: '其他…' }, 'invalid_category'],
      [{ industry: 'B2B SaaS · 项目协作' }, 'invalid_category'],
      [{ targetKeywords: ['移除元数据'] }, 'invalid_keywords'],
      [{ targetKeywords: Array.from({ length: 21 }, (_, i) => `kw ${i}`) }, 'invalid_keywords'],
      [{ targetKeywords: 'not an array' }, 'invalid_keywords'],
    ])('%j → 422 %s，不建项目', async (extra, code) => {
      const res = await post({ domain: 'example.com', ...extra })
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({ error: code })
      expect(inserts).toHaveLength(0)
    })

    it('合规输入：语言恒为 en（忽略入参）、不再写 market_location、目标关键词按市场入库', async () => {
      const res = await post({ domain: 'example.com', industry: ' document metadata removal tool ', market: 'gb', language: 'zh', targetKeywords: [' remove pdf metadata '] })
      expect(res.status).toBe(201)
      const project = inserts.find((i) => i.table === projects)?.values
      expect(project).toMatchObject({ industry: 'document metadata removal tool', market: 'gb', language: 'en' })
      const settings = inserts.find((i) => i.table !== projects)?.values
      expect(settings).not.toHaveProperty('marketLocation')
      expect(setTargetKeywordsMock).toHaveBeenCalledWith(project?.id, ['remove pdf metadata'])
    })

    it('复用项目时返回已存的目标关键词', async () => {
      getProjectByDomainMock.mockResolvedValue({ id: 'proj_existing', domain: 'https://example.com/' })
      getTargetKeywordsMock.mockResolvedValueOnce(['remove pdf metadata'])
      const body = await (await post({ domain: 'example.com' })).json()
      expect(body.targetKeywords).toEqual(['remove pdf metadata'])
    })
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
