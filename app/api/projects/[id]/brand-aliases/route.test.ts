import { describe, it, expect, vi, beforeEach } from 'vitest'

const setBrandAliasesCalls: { projectId: string; aliases: string[] }[] = []
const getProjectMock = vi.fn(async (id: string) => (id === 'proj_missing' ? undefined : { id, domain: 'a.com' }))

vi.mock('@/lib/repositories', () => ({
  getProject: (id: string) => getProjectMock(id),
  setBrandAliases: (projectId: string, aliases: string[]) => {
    setBrandAliasesCalls.push({ projectId, aliases })
    return Promise.resolve()
  },
}))

import { POST } from './route'

function post(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/projects/${id}/brand-aliases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

describe('POST /api/projects/[id]/brand-aliases', () => {
  beforeEach(() => {
    setBrandAliasesCalls.length = 0
    getProjectMock.mockClear()
  })

  it('404 当项目不存在', async () => {
    const res = await post('proj_missing', { aliases: ['小别名'] })
    expect(res.status).toBe(404)
    expect(setBrandAliasesCalls).toHaveLength(0)
  })

  it('422 当 aliases 不是数组', async () => {
    const res = await post('proj_a', { aliases: '小别名' })
    expect(res.status).toBe(422)
  })

  it('去重、去空白、去空字符串后落库', async () => {
    const res = await post('proj_a', { aliases: [' 小别名 ', '旧名', '旧名', '  ', ''] })
    expect(res.status).toBe(200)
    expect(setBrandAliasesCalls).toEqual([{ projectId: 'proj_a', aliases: ['小别名', '旧名'] }])
    expect(await res.json()).toEqual({ ok: true, aliases: ['小别名', '旧名'] })
  })

  it('允许保存为空数组（清空别名）', async () => {
    const res = await post('proj_a', { aliases: [] })
    expect(res.status).toBe(200)
    expect(setBrandAliasesCalls).toEqual([{ projectId: 'proj_a', aliases: [] }])
  })
})
