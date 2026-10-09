import { describe, it, expect, vi } from 'vitest'
import { mirrorRecommendationStatus, mirrorRecommendationApplied, mirrorFindingStatus, type BridgeDeps } from './bridge'
import type { IssueRecord } from './types'

const baseIssue = { id: 'iss_1', decision: 'pending', executedAt: null } as unknown as IssueRecord
function makeDeps(issue: Partial<IssueRecord> | null = {}): BridgeDeps & { runIssueAction: ReturnType<typeof vi.fn> } {
  return {
    getRecommendation: vi.fn(async () => ({ id: 'rec_1', runId: 'run_1', findingId: 'find_1' })),
    getFinding: vi.fn(async () => ({ id: 'find_1', runId: 'run_1', fingerprint: 'fp_1' })),
    getRun: vi.fn(async () => ({ id: 'run_1', projectId: 'proj_1' })),
    getIssueByFingerprint: vi.fn(async () => (issue === null ? undefined : ({ ...baseIssue, ...issue } as IssueRecord))),
    runIssueAction: vi.fn(async () => ({}) as IssueRecord),
  } as never
}

describe('旧界面桥接', () => {
  it('接受 / 编辑 → 纳入；已纳入则不重复', async () => {
    const d = makeDeps()
    await mirrorRecommendationStatus('rec_1', 'accepted', d)
    expect(d.runIssueAction).toHaveBeenCalledWith('iss_1', { kind: 'include' }, 'operator', '旧界面：接受建议')
    const d2 = makeDeps({ decision: 'included' })
    await mirrorRecommendationStatus('rec_1', 'edited', d2)
    expect(d2.runIssueAction).not.toHaveBeenCalled()
  })

  it('否决 → 暂不处理（固定理由）；已排除不重复；改回待确认 → 不动', async () => {
    const d = makeDeps()
    await mirrorRecommendationStatus('rec_1', 'rejected', d)
    expect(d.runIssueAction).toHaveBeenCalledWith('iss_1', { kind: 'defer', reason: '旧界面否决（未记录理由）' }, 'operator', undefined)
    const d2 = makeDeps({ decision: 'false_positive' })
    await mirrorRecommendationStatus('rec_1', 'rejected', d2)
    await mirrorRecommendationStatus('rec_1', 'draft', d2)
    expect(d2.runIssueAction).not.toHaveBeenCalled()
  })

  it('标记已执行：未纳入的先纳入再执行；撤销执行只在执行过时调用', async () => {
    const d = makeDeps()
    await mirrorRecommendationApplied('rec_1', true, '改好了', d)
    expect(d.runIssueAction.mock.calls.map((c) => c[1])).toEqual([{ kind: 'include' }, { kind: 'execute', note: '改好了' }])
    const d2 = makeDeps({ decision: 'included', executedAt: '2026-11-01T00:00:00.000Z' })
    await mirrorRecommendationApplied('rec_1', false, undefined, d2)
    expect(d2.runIssueAction).toHaveBeenCalledWith('iss_1', { kind: 'undo_execute' }, 'operator', undefined)
  })

  it('发现忽略 → 误报（理由用忽略原因）；改回 open → 撤销排除', async () => {
    const d = makeDeps()
    await mirrorFindingStatus('find_1', 'dismissed', '品牌站首页可以这样写', d)
    expect(d.runIssueAction).toHaveBeenCalledWith('iss_1', { kind: 'false_positive', reason: '品牌站首页可以这样写' }, 'operator', undefined)
    const d2 = makeDeps({ decision: 'false_positive' })
    await mirrorFindingStatus('find_1', 'open', undefined, d2)
    expect(d2.runIssueAction).toHaveBeenCalledWith('iss_1', { kind: 'reopen' }, 'operator', undefined)
  })

  // 问题已被体检核实结果（如 fixed）时，问题动作会抛 action_not_allowed：旧界面的写入已完成，镜像要吞掉这一种错误。
  describe('问题动作被拒（action_not_allowed）', () => {
    it('撤销执行：action_not_allowed 被吞掉，不抛出', async () => {
      const d = makeDeps({ decision: 'included', executedAt: '2026-11-01T00:00:00.000Z' })
      d.runIssueAction.mockRejectedValueOnce(new Error('action_not_allowed'))
      await expect(mirrorRecommendationApplied('rec_1', false, undefined, d)).resolves.toBeUndefined()
      expect(d.runIssueAction).toHaveBeenCalledTimes(1)
    })

    it('撤销执行：其他错误照常抛出', async () => {
      const d = makeDeps({ decision: 'included', executedAt: '2026-11-01T00:00:00.000Z' })
      d.runIssueAction.mockRejectedValueOnce(new Error('db locked'))
      await expect(mirrorRecommendationApplied('rec_1', false, undefined, d)).rejects.toThrow('db locked')
    })

    it('发现忽略：action_not_allowed 被吞掉，其他错误照常抛出', async () => {
      const d = makeDeps()
      d.runIssueAction.mockRejectedValueOnce(new Error('action_not_allowed'))
      await expect(mirrorFindingStatus('find_1', 'dismissed', '理由', d)).resolves.toBeUndefined()
      const d2 = makeDeps()
      d2.runIssueAction.mockRejectedValueOnce(new Error('db locked'))
      await expect(mirrorFindingStatus('find_1', 'dismissed', '理由', d2)).rejects.toThrow('db locked')
    })

    it('标记已执行：执行被拒（问题已 fixed）时吞掉；其他错误照常抛出', async () => {
      const d = makeDeps({ decision: 'included' })
      d.runIssueAction.mockRejectedValueOnce(new Error('action_not_allowed'))
      await expect(mirrorRecommendationApplied('rec_1', true, '改好了', d)).resolves.toBeUndefined()
      const d2 = makeDeps({ decision: 'included' })
      d2.runIssueAction.mockRejectedValueOnce(new Error('db locked'))
      await expect(mirrorRecommendationApplied('rec_1', true, '改好了', d2)).rejects.toThrow('db locked')
    })

    it('否决 / 接受建议：被拒时吞掉；其他错误照常抛出', async () => {
      const d = makeDeps()
      d.runIssueAction.mockRejectedValueOnce(new Error('action_not_allowed'))
      await expect(mirrorRecommendationStatus('rec_1', 'rejected', d)).resolves.toBeUndefined()
      const d2 = makeDeps()
      d2.runIssueAction.mockRejectedValueOnce(new Error('db locked'))
      await expect(mirrorRecommendationStatus('rec_1', 'accepted', d2)).rejects.toThrow('db locked')
    })

    it('非 Error 抛出物（字符串）不算 action_not_allowed，照常抛出', async () => {
      const d = makeDeps()
      d.runIssueAction.mockRejectedValueOnce('action_not_allowed')
      await expect(mirrorFindingStatus('find_1', 'dismissed', '理由', d)).rejects.toBe('action_not_allowed')
    })
  })

  it('找不到对应问题（未回填的旧体检）→ 什么都不做', async () => {
    const d = makeDeps(null)
    await mirrorRecommendationStatus('rec_1', 'accepted', d)
    await mirrorRecommendationApplied('rec_1', true, undefined, d)
    expect(d.runIssueAction).not.toHaveBeenCalled()
  })
})
