import { describe, it, expect } from 'vitest'
import { lifecycleSteps, nextAction, effectiveStatus, runShortId, displayDomain, isRunFinished, type RecCounts } from './workspace'

const none: RecCounts = { total: 0, draft: 0, decided: 0, applied: 0 }
const pending: RecCounts = { total: 15, draft: 2, decided: 13, applied: 0 }
const allDecided: RecCounts = { total: 15, draft: 0, decided: 15, applied: 3 }

function states(steps: ReturnType<typeof lifecycleSteps>) {
  return steps.map((s) => `${s.key}:${s.state}${s.count ? `(${s.count})` : ''}`)
}

describe('lifecycleSteps（ux-blueprint §3 进度与 RunStatus 对应）', () => {
  it('采集中：第一步是当前，其余未开始', () => {
    expect(states(lifecycleSteps('collecting', none))).toEqual([
      'collect:current', 'diagnose:todo', 'review:todo', 'execute:todo', 'retest:todo',
    ])
  })

  it('诊断中：采集完成，诊断是当前', () => {
    expect(states(lifecycleSteps('diagnosing', none)).slice(0, 2)).toEqual(['collect:done', 'diagnose:current'])
  })

  it('reviewing：确认建议是当前，带「已处理 / 总数」', () => {
    expect(states(lifecycleSteps('reviewing', pending))).toEqual([
      'collect:done', 'diagnose:done', 'review:current(13/15)', 'execute:todo', 'retest:todo',
    ])
  })

  it('output：执行是当前，带「已执行 / 已接受」', () => {
    expect(states(lifecycleSteps('output', allDecided))).toEqual([
      'collect:done', 'diagnose:done', 'review:done(15/15)', 'execute:current(3/15)', 'retest:todo',
    ])
  })

  it('历史兼容：reviewing 但建议已全部处理，按 output 显示', () => {
    expect(effectiveStatus('reviewing', allDecided)).toBe('output')
    expect(lifecycleSteps('reviewing', allDecided)[3].state).toBe('current')
  })

  it('reviewing 但一条建议都没有：仍停在确认建议，不冒充已完成', () => {
    expect(effectiveStatus('reviewing', none)).toBe('reviewing')
    expect(lifecycleSteps('reviewing', none)[2]).toEqual({ key: 'review', state: 'current' })
  })

  it('失败：标出未完成，不把任何一步标成已完成', () => {
    const steps = lifecycleSteps('failed', none)
    expect(steps[0].state).toBe('failed')
    expect(steps.some((s) => s.state === 'done')).toBe(false)
  })
})

describe('nextAction（抬头唯一的主动作）', () => {
  it('reviewing → 去确认建议，带待确认条数', () => {
    expect(nextAction('reviewing', pending)).toEqual({ kind: 'review', pending: 2 })
  })

  it('output 或已全部处理 → 打开执行清单', () => {
    expect(nextAction('output', allDecided)).toEqual({ kind: 'execute' })
    expect(nextAction('reviewing', allDecided)).toEqual({ kind: 'execute' })
  })

  it('进行中或失败 → 没有主动作', () => {
    expect(nextAction('collecting', none)).toBeNull()
    expect(nextAction('failed', none)).toBeNull()
  })
})

describe('显示辅助', () => {
  it('runShortId 取 run_ 后 8 位', () => {
    expect(runShortId('run_05face85-9769-4915-9b2e-ebb31c6d894e')).toBe('05face85')
  })

  it('displayDomain 去掉协议、www 和结尾斜杠', () => {
    expect(displayDomain('https://metadocu.com/')).toBe('metadocu.com')
    expect(displayDomain('https://www.example.org/a')).toBe('example.org')
    expect(displayDomain('metadocu.com/')).toBe('metadocu.com')
  })

  it('isRunFinished 只认 reviewing / output', () => {
    expect(isRunFinished('output')).toBe(true)
    expect(isRunFinished('collected')).toBe(false)
  })
})
