import { describe, it, expect, vi, beforeEach } from 'vitest'
import { projects, projectSettings } from '@/db/schema'

const updates: { table: unknown; values: Record<string, unknown> }[] = []
const { getProjectMock, setTargetKeywordsMock, getTargetKeywordsMock } = vi.hoisted(() => ({
  getProjectMock: vi.fn(),
  setTargetKeywordsMock: vi.fn(async (...args: unknown[]) => { void args }),
  getTargetKeywordsMock: vi.fn(async (...args: unknown[]) => { void args; return [] as string[] }),
}))

vi.mock('@/db/client', () => ({
  db: {
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table, values })
        return { where: () => ({ returning: async () => [{ id: 'proj_1', market: 'gb', ...values }] }) }
      },
    }),
  },
}))

vi.mock('@/lib/repositories', () => ({
  getProject: getProjectMock,
  setTargetKeywords: setTargetKeywordsMock,
  getTargetKeywords: getTargetKeywordsMock,
}))

const { GET, PATCH } = await import('./route')
const ctx = { params: Promise.resolve({ id: 'proj_1' }) }
const patch = (body: unknown) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), ctx)

describe('PATCH /api/projects/[id]（SP-A §3.2/§3.3）', () => {
  beforeEach(() => {
    updates.length = 0
    setTargetKeywordsMock.mockClear()
    getProjectMock.mockReset().mockResolvedValue({ id: 'proj_1', domain: 'https://example.com/', industry: '', market: 'gb', language: 'zh' })
  })

  it.each([
    [{ market: 'English · Global' }, 'invalid_market'],
    [{ industry: '其他…' }, 'invalid_category'],
    [{ targetKeywords: ['移除元数据'] }, 'invalid_keywords'],
  ])('%j → 422 %s，不写库', async (body, code) => {
    const res = await patch(body)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: code })
    expect(updates).toHaveLength(0)
  })

  it('合规更新：语言恒为 en、不再同步 market_location，引擎选择照常写设置', async () => {
    const res = await patch({ industry: 'document metadata removal tool', market: 'us', language: 'zh', defaultModels: ['ChatGPT'] })
    expect(res.status).toBe(200)
    expect(updates.find((u) => u.table === projects)?.values).toMatchObject({ industry: 'document metadata removal tool', market: 'us', language: 'en' })
    const settings = updates.find((u) => u.table === projectSettings)?.values
    expect(settings).toEqual({ defaultModels: ['ChatGPT'] })
  })

  it('目标关键词按更新后的市场整组替换；未改市场时用项目原市场', async () => {
    await patch({ market: 'us', targetKeywords: ['remove pdf metadata'] })
    expect(setTargetKeywordsMock).toHaveBeenLastCalledWith('proj_1', ['remove pdf metadata'])
    await patch({ targetKeywords: [] })
    expect(setTargetKeywordsMock).toHaveBeenLastCalledWith('proj_1', [])
  })

  it('GET 返回目标关键词', async () => {
    getTargetKeywordsMock.mockResolvedValueOnce(['remove pdf metadata'])
    const body = await (await GET(new Request('http://x'), ctx)).json()
    expect(body.targetKeywords).toEqual(['remove pdf metadata'])
  })
})
