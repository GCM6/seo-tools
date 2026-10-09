import { describe, it, expect, vi, beforeEach } from 'vitest'

// 端点级测试：mock DB 层 + repositories 层，隔离真实连接。这是本文件第一份测试
// （route.ts 此前没有测试覆盖），聚焦本次改动触达的行为：applied=true 同步执行到问题表、
// applied=false 撤销分支（A3 补充）、status 分支同步问题决定——不重新覆盖 status 分支的 run 状态机全量矩阵。

const store: { rec: Record<string, unknown> | null } = { rec: null }

vi.mock('@/db/client', () => ({
  db: {
    query: {
      recommendations: {
        findFirst: async () => (store.rec ? { ...store.rec } : undefined),
        findMany: async () => (store.rec ? [{ ...store.rec }] : []),
      },
    },
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        if (store.rec) store.rec = { ...store.rec, ...patch }
        return {
          where: () => {
            const result = Promise.resolve(undefined) as Promise<unknown> & { returning?: () => Promise<unknown[]> }
            result.returning = async () => (store.rec ? [{ ...store.rec }] : [])
            return result
          },
        }
      },
    }),
  },
}))

const getRunMock = vi.fn(async () => ({ id: 'run_1', projectId: 'prj_1' }))
const markRecommendationAppliedMock = vi.fn(async (id: string, note: string) => {
  if (store.rec) store.rec = { ...store.rec, appliedAt: '2026-07-19T00:00:00.000Z', appliedNote: note }
})
const markRunStatusMock = vi.fn(async () => undefined)
const setProjectNextRetestDueMock = vi.fn(async () => undefined)

vi.mock('@/lib/repositories', () => ({
  getRun: (...args: unknown[]) => getRunMock(...(args as [])),
  markRecommendationApplied: (...args: unknown[]) => markRecommendationAppliedMock(...(args as [string, string])),
  markRunStatus: (...args: unknown[]) => markRunStatusMock(...(args as [])),
  setProjectNextRetestDue: (...args: unknown[]) => setProjectNextRetestDueMock(...(args as [])),
}))

const mirrorStatusMock = vi.fn(async () => undefined)
const mirrorAppliedMock = vi.fn(async () => undefined)
vi.mock('@/lib/issues/bridge', () => ({
  mirrorRecommendationStatus: (...a: unknown[]) => mirrorStatusMock(...(a as [])),
  mirrorRecommendationApplied: (...a: unknown[]) => mirrorAppliedMock(...(a as [])),
}))

import { PATCH } from './route'

function patch(id: string, body: Record<string, unknown>) {
  return PATCH(new Request(`http://x/api/recommendations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  })
}

function baseRec(over: Record<string, unknown> = {}) {
  return {
    id: 'rec_1',
    runId: 'run_1',
    status: 'accepted',
    appliedAt: null,
    appliedNote: null,
    ...over,
  }
}

describe('PATCH /api/recommendations/:id', () => {
  beforeEach(() => {
    store.rec = null
    getRunMock.mockClear().mockResolvedValue({ id: 'run_1', projectId: 'prj_1' })
    markRecommendationAppliedMock.mockClear()
    markRunStatusMock.mockClear()
    setProjectNextRetestDueMock.mockClear()
    mirrorStatusMock.mockClear()
    mirrorAppliedMock.mockClear()
  })

  describe('applied: true（标记已执行）', () => {
    it('404 when recommendation missing', async () => {
      const res = await patch('nope', { applied: true, appliedNote: '' })
      expect(res.status).toBe(404)
      expect(mirrorAppliedMock).not.toHaveBeenCalled()
    })

    it('422 not_gated when status is not accepted/edited', async () => {
      store.rec = baseRec({ status: 'draft' })
      const res = await patch('rec_1', { applied: true, appliedNote: '' })
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({ error: 'not_gated' })
      expect(markRecommendationAppliedMock).not.toHaveBeenCalled()
      expect(mirrorAppliedMock).not.toHaveBeenCalled()
    })

    it('success: marks applied and mirrors execution to the issue (retest due recomputed from issues)', async () => {
      store.rec = baseRec({ status: 'accepted' })
      const res = await patch('rec_1', { applied: true, appliedNote: '已发布到 CMS' })
      expect(res.status).toBe(200)

      expect(markRecommendationAppliedMock).toHaveBeenCalledWith('rec_1', '已发布到 CMS')
      expect(mirrorAppliedMock).toHaveBeenCalledWith('rec_1', true, '已发布到 CMS')
      // 复查提醒改由问题表重算，不再每次 +28 天。
      expect(setProjectNextRetestDueMock).not.toHaveBeenCalled()

      const body = await res.json()
      expect(body.appliedAt).toBe('2026-07-19T00:00:00.000Z')
      expect(body.appliedNote).toBe('已发布到 CMS')
    })
  })

  describe('applied: false（撤销已执行，A3 补充）', () => {
    it('404 when recommendation missing', async () => {
      const res = await patch('nope', { applied: false })
      expect(res.status).toBe(404)
      expect(mirrorAppliedMock).not.toHaveBeenCalled()
    })

    it('success: clears appliedAt/appliedNote and does NOT recompute nextRetestDueAt', async () => {
      store.rec = baseRec({ status: 'accepted', appliedAt: '2026-07-01T00:00:00.000Z', appliedNote: '已发布到 CMS' })

      const res = await patch('rec_1', { applied: false })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.appliedAt).toBeNull()
      expect(body.appliedNote).toBeNull()

      // 撤销执行同步到问题表（问题表自己重算复查提醒），本路由不直接触碰回测排期。
      expect(mirrorAppliedMock).toHaveBeenCalledWith('rec_1', false)
      expect(setProjectNextRetestDueMock).not.toHaveBeenCalled()
      expect(markRecommendationAppliedMock).not.toHaveBeenCalled()
    })

    it('works even when the recommendation was never applied (idempotent no-op on already-clear fields)', async () => {
      store.rec = baseRec({ status: 'accepted' })
      const res = await patch('rec_1', { applied: false })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.appliedAt).toBeNull()
      expect(body.appliedNote).toBeNull()
    })
  })

  describe('status（接受 / 编辑 / 否决 / 改回待确认）', () => {
    it('success: updates the status and mirrors it to the issue', async () => {
      store.rec = baseRec({ status: 'draft' })
      const res = await patch('rec_1', { status: 'accepted' })
      expect(res.status).toBe(200)
      expect((await res.json()).status).toBe('accepted')
      expect(mirrorStatusMock).toHaveBeenCalledWith('rec_1', 'accepted')
    })

    it('does not mirror when the status is invalid or the recommendation is missing', async () => {
      expect((await patch('rec_1', { status: 'bogus' })).status).toBe(422)
      expect((await patch('nope', { status: 'accepted' })).status).toBe(404)
      expect(mirrorStatusMock).not.toHaveBeenCalled()
    })
  })
})
