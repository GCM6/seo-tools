import { describe, it, expect } from 'vitest'
import { PHASES, initialStagelineState, reduceProgress } from './stageline'

const s0 = () => initialStagelineState('collecting')

describe('reduceProgress', () => {
  it('progress 更新 pct', () => {
    expect(reduceProgress(s0(), { type: 'progress', pct: 42 }).pct).toBe(42)
  })
  it('phase 到达把先前相位并入 completed 并切当前', () => {
    const s = reduceProgress(s0(), { type: 'phase', phase: 'cluster' })
    expect(s.currentPhase).toBe('cluster')
    expect(s.completed).toEqual(['discover', 'light_check'])
  })
  it('phase 带 checked/total → phaseProgress；换相位重置', () => {
    let s = reduceProgress(s0(), { type: 'phase', phase: 'light_check', checked: 37, total: 120 })
    expect(s.phaseProgress).toEqual({ checked: 37, total: 120 })
    s = reduceProgress(s, { type: 'phase', phase: 'deep_check' })
    expect(s.phaseProgress).toBeNull()
  })
  it('diagnose 相位带 findings 累计', () => {
    const s = reduceProgress(s0(), { type: 'phase', phase: 'diagnose', findings: 9 })
    expect(s.currentPhase).toBe('diagnose')
    expect(s.findings).toBe(9)
  })
  it('evidence_created 累加 counts 并置 lastEvent', () => {
    let s = reduceProgress(s0(), { type: 'evidence_created', evidenceType: 'page_fetch' })
    s = reduceProgress(s, { type: 'evidence_created', evidenceType: 'page_fetch' })
    s = reduceProgress(s, { type: 'evidence_created', evidenceType: 'ai_answer' })
    expect(s.counts.page_fetch).toBe(2)
    expect(s.counts.ai_answer).toBe(1)
    expect(s.lastEvent).toEqual({ evidenceType: 'ai_answer' })
  })
  it('done → collected/pct100/全相位完成', () => {
    const s = reduceProgress(s0(), { type: 'done' })
    expect(s.status).toBe('collected')
    expect(s.pct).toBe(100)
    expect(s.completed).toEqual(PHASES)
  })
  it('failed → 带 reason，失败相位保留', () => {
    const s = reduceProgress(reduceProgress(s0(), { type: 'phase', phase: 'probes' }), { type: 'failed', reason: 'boom' })
    expect(s.status).toBe('failed')
    expect(s.reason).toBe('boom')
    expect(s.currentPhase).toBe('probes')
  })
  it('initialStagelineState(failed) 带初始原因', () => {
    expect(initialStagelineState('failed', 'x').reason).toBe('x')
  })
})
