import { describe, it, expect, vi, beforeEach } from 'vitest'

// 端点级测试：mock DB 层 + repositories 层，隔离真实连接。这是本文件第一份测试
// （route.ts 此前没有测试覆盖），聚焦本次改动触达的行为：applied=true 的顺延计算、
// applied=false 撤销分支（A3 补充）——不重新覆盖未改动的 status 分支全量矩阵。

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
const setProjectNextRetestDueMock = vi.fn(async (_projectId: string, _dueAtIso: string) => undefined)

vi.mock('@/lib/repositories', () => ({
  getRun: (...args: unknown[]) => getRunMock(...(args as [])),
  markRecommendationApplied: (...args: unknown[]) => markRecommendationAppliedMock(...(args as [string, string])),
  markRunStatus: (...args: unknown[]) => markRunStatusMock(...(args as [])),
  setProjectNextRetestDue: (...args: unknown[]) => setProjectNextRetestDueMock(...(args as [string, string])),
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
  })

  describe('applied: true（标记已执行）', () => {
    it('404 when recommendation missing', async () => {
      const res = await patch('nope', { applied: true, appliedNote: '' })
      expect(res.status).toBe(404)
    })

    it('422 not_gated when status is not accepted/edited', async () => {
      store.rec = baseRec({ status: 'draft' })
      const res = await patch('rec_1', { applied: true, appliedNote: '' })
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({ error: 'not_gated' })
      expect(markRecommendationAppliedMock).not.toHaveBeenCalled()
    })

    it('success: marks applied and pushes project nextRetestDueAt to +28 days from now', async () => {
      store.rec = baseRec({ status: 'accepted' })
      const before = Date.now()
      const res = await patch('rec_1', { applied: true, appliedNote: '已发布到 CMS' })
      expect(res.status).toBe(200)

      expect(markRecommendationAppliedMock).toHaveBeenCalledWith('rec_1', '已发布到 CMS')
      expect(setProjectNextRetestDueMock).toHaveBeenCalledTimes(1)
      const [projectId, dueAtIso] = setProjectNextRetestDueMock.mock.calls[0] as [string, string]
      expect(projectId).toBe('prj_1')

      // 计算逻辑保持不变：最新一次 applied 时间 + 28 天（RETEST_WINDOW_DAYS），
      // 用宽松的时间窗口容差校验，不写死具体时间戳。
      const expectedMs = before + 28 * 24 * 60 * 60 * 1000
      const actualMs = new Date(dueAtIso).getTime()
      expect(Math.abs(actualMs - expectedMs)).toBeLessThan(5000)

      const body = await res.json()
      expect(body.appliedAt).toBe('2026-07-19T00:00:00.000Z')
      expect(body.appliedNote).toBe('已发布到 CMS')
    })
  })

  describe('applied: false（撤销已执行，A3 补充）', () => {
    it('404 when recommendation missing', async () => {
      const res = await patch('nope', { applied: false })
      expect(res.status).toBe(404)
    })

    it('success: clears appliedAt/appliedNote and does NOT recompute nextRetestDueAt', async () => {
      store.rec = baseRec({ status: 'accepted', appliedAt: '2026-07-01T00:00:00.000Z', appliedNote: '已发布到 CMS' })

      const res = await patch('rec_1', { applied: false })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.appliedAt).toBeNull()
      expect(body.appliedNote).toBeNull()

      // 撤销不触碰回测排期——回滚需要重算全局最新 applied 时间，超出本次范围（口径已在 UI 说明）。
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
})
