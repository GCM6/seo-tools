import { describe, it, expect, vi, beforeEach } from 'vitest'

// 端点级测试：mock repositories 层（隔离 DB），验证人在环闸门 + 真实拼装 + 落库。
const store = {
  rec: null as null | Record<string, unknown>,
  finding: null as null | Record<string, unknown>,
  run: { id: 'run_1', projectId: 'prj_1' } as null | Record<string, unknown>,
  project: { id: 'prj_1', domain: 'https://example.com/' } as null | Record<string, unknown>,
  facts: [] as { id: string; factText: string; status: string }[],
}
const created: Record<string, unknown>[] = []

vi.mock('@/lib/repositories', () => ({
  getRecommendation: async () => store.rec,
  getFinding: async () => store.finding,
  getRun: async () => store.run,
  getProject: async () => store.project,
  getBrandFacts: async () => store.facts,
  createGeneratedPrompt: async (row: Record<string, unknown>) => {
    created.push(row)
    return [row]
  },
  assertCanGeneratePrompt: (status: string) => {
    if (status !== 'accepted' && status !== 'edited')
      throw new Error(`recommendation status "${status}" cannot generate prompt`)
  },
}))

import { POST } from './route'

const call = (id: string) => POST(new Request('http://x'), { params: Promise.resolve({ id }) })

beforeEach(() => {
  store.rec = null
  store.finding = { id: 'f_1', side: 'technical', evidenceRefs: ['ev_9'] }
  store.facts = []
  created.length = 0
})

describe('POST /recommendations/:id/prompt', () => {
  it('404 when recommendation missing', async () => {
    const res = await call('nope')
    expect(res.status).toBe(404)
  })

  it('422 when status is not accepted/edited', async () => {
    store.rec = baseRec({ status: 'draft' })
    const res = await call('r_1')
    expect(res.status).toBe(422)
  })

  it('assembles a real technical prompt (not <stub>) and persists it', async () => {
    store.rec = baseRec({ status: 'accepted' })
    const res = await call('r_1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.promptType).toBe('technical')
    expect(body.promptText).not.toBe('<stub>')
    expect(body.promptText).toContain('example.com')
    expect(created).toHaveLength(1)
    expect(created[0].promptText).toBe(body.promptText)
    expect(created[0].evidenceRefs).toEqual(['ev_9']) // 取自 finding
    expect(created[0].inputFactRefs).toEqual([]) // technical 不注入事实
  })

  it('content finding injects verified facts into inputFactRefs', async () => {
    store.rec = baseRec({ status: 'edited' })
    store.finding = { id: 'f_1', side: 'geo', evidenceRefs: ['ev_9'] }
    store.facts = [
      { id: 'bf_1', factText: '成立于 2010', status: 'verified' },
      { id: 'bf_2', factText: '草稿事实', status: 'draft' },
    ]
    const res = await call('r_1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.promptType).toBe('content')
    expect(body.promptText).toContain('成立于 2010')
    expect(created[0].inputFactRefs).toEqual(['bf_1']) // 仅 verified 注入
  })
})

function baseRec(over: Record<string, unknown> = {}) {
  return {
    id: 'r_1',
    runId: 'run_1',
    findingId: 'f_1',
    what: '修正 canonical 指向自身。',
    why: 'canonical 指向站外。',
    expectedImpact: '高',
    validationMethod: '重新抓取确认。',
    status: 'accepted',
    editedPayload: null,
    evidenceRefs: ['ev_rec'],
    ...over,
  }
}
