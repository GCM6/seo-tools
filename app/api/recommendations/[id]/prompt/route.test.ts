import { describe, it, expect, vi, beforeEach } from 'vitest'

// 端点级测试：mock repositories 层（隔离 DB），验证人在环闸门 + 真实拼装 + 落库 + 幂等契约。
const store = {
  rec: null as null | Record<string, unknown>,
  finding: null as null | Record<string, unknown>,
  run: { id: 'run_1', projectId: 'prj_1' } as null | Record<string, unknown>,
  project: { id: 'prj_1', domain: 'https://example.com/' } as null | Record<string, unknown>,
  facts: [] as { id: string; factText: string; status: string }[],
}
const created: Record<string, unknown>[] = []
let seq = 0

vi.mock('@/lib/repositories', () => ({
  getRecommendation: async () => store.rec,
  getFinding: async () => store.finding,
  getRun: async () => store.run,
  getProject: async () => store.project,
  getBrandFacts: async () => store.facts,
  getRunEvidence: async () => (store as { evidence?: unknown[] }).evidence ?? [],
  createGeneratedPrompt: async (row: Record<string, unknown>) => {
    // createdAt 用递增序列模拟真实时间戳，确保 latestPerType 的排序可测。
    const stored = { ...row, createdAt: `2026-01-01T00:00:${String(seq++).padStart(2, '0')}Z` }
    created.push(stored)
    return [stored]
  },
  getGeneratedPromptsForRec: async (recommendationId: string) =>
    created.filter((r) => r.recommendationId === recommendationId),
  assertCanGeneratePrompt: (status: string) => {
    if (status !== 'accepted' && status !== 'edited')
      throw new Error(`recommendation status "${status}" cannot generate prompt`)
  },
}))

import { POST } from './route'

const call = (id: string, qs = '') => POST(new Request(`http://x${qs}`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  store.rec = null
  store.finding = { id: 'f_1', side: 'technical', evidenceRefs: ['ev_9'] }
  store.facts = []
  created.length = 0
  seq = 0
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

  it('assembles a real technical prompt (not <stub>) and persists it under the { prompts } contract', async () => {
    store.rec = baseRec({ status: 'accepted' })
    const res = await call('r_1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.prompts).toHaveLength(1)
    const [p] = body.prompts
    expect(p.promptType).toBe('technical')
    expect(p.promptText).not.toBe('<stub>')
    expect(p.promptText).toContain('example.com')
    expect(typeof p.id).toBe('string')
    expect(created).toHaveLength(1)
    expect(created[0].id).toBe(p.id)
    expect(created[0].promptText).toBe(p.promptText)
    expect(created[0].evidenceRefs).toEqual(['ev_9']) // 取自 finding
    expect(created[0].inputFactRefs).toEqual([]) // technical 不注入事实
  })

  it('content finding injects verified facts and returns both content + brief prompts', async () => {
    store.rec = baseRec({ status: 'edited' })
    store.finding = { id: 'f_1', side: 'geo', evidenceRefs: ['ev_9'] }
    store.facts = [
      { id: 'bf_1', factText: '成立于 2010', status: 'verified' },
      { id: 'bf_2', factText: '草稿事实', status: 'draft' },
    ]
    const res = await call('r_1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.prompts).toHaveLength(2)
    expect(body.prompts.map((p: { promptType: string }) => p.promptType)).toEqual(['content', 'brief'])
    const contentPrompt = body.prompts.find((p: { promptType: string }) => p.promptType === 'content')
    expect(contentPrompt.promptText).toContain('成立于 2010')
    expect(created).toHaveLength(2)
    const contentRow = created.find((r) => r.promptType === 'content')
    expect(contentRow?.inputFactRefs).toEqual(['bf_1']) // 仅 verified 注入
  })

  it('second call is idempotent: returns the same generated_prompts ids without re-creating rows', async () => {
    store.rec = baseRec({ status: 'accepted' })
    const first = await (await call('r_1')).json()
    expect(created).toHaveLength(1)

    const second = await (await call('r_1')).json()
    expect(created).toHaveLength(1) // 未重复落库
    expect(second.prompts).toEqual(first.prompts)
    expect(second.prompts[0].id).toBe(first.prompts[0].id)
  })

  it('?regenerate=1 forces a new generation, appends a new row, and returns the newest ids', async () => {
    store.rec = baseRec({ status: 'accepted' })
    const first = await (await call('r_1')).json()
    expect(created).toHaveLength(1)

    const second = await (await call('r_1', '?regenerate=1')).json()
    expect(created).toHaveLength(2) // 旧记录保留留痕，追加新记录
    expect(second.prompts[0].id).not.toBe(first.prompts[0].id)
    expect(second.prompts[0].promptType).toBe('technical')

    // 后续非 regenerate 调用应回落到最新一条（第二条），而不是最早一条。
    const third = await (await call('r_1')).json()
    expect(created).toHaveLength(2)
    expect(third.prompts[0].id).toBe(second.prompts[0].id)
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
