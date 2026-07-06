import { describe, it, expect } from 'vitest'
import type { PsiResult } from './psi'
import {
  analyzeCwv,
  lighthouseClues,
  ttfbConcern,
  CWV_LCP_MAX_MS,
  CWV_INP_MAX_MS,
  CWV_CLS_MAX,
  TTFB_SLOW_MS,
} from './psi-analyze'

function makePsi(overrides: Partial<PsiResult>): PsiResult {
  return {
    strategy: 'mobile',
    crux: { lcpMs: null, inpMs: null, cls: null, hasFieldData: false },
    lighthouse: { performanceScore: null, opportunities: [], ttfbMs: null },
    ...overrides,
  }
}

describe('analyzeCwv', () => {
  it('无字段数据时返回空数组（降级，不下排名结论）', () => {
    const psi = makePsi({ crux: { lcpMs: 3000, inpMs: 300, cls: 0.5, hasFieldData: false } })
    expect(analyzeCwv(psi)).toEqual([])
  })

  it('全部达标标 passes=true', () => {
    const psi = makePsi({
      strategy: 'desktop',
      crux: { lcpMs: 2000, inpMs: 100, cls: 0.05, hasFieldData: true },
    })
    const result = analyzeCwv(psi)
    expect(result).toEqual([
      { metric: 'LCP', value: 2000, strategy: 'desktop', passes: true },
      { metric: 'INP', value: 100, strategy: 'desktop', passes: true },
      { metric: 'CLS', value: 0.05, strategy: 'desktop', passes: true },
    ])
  })

  it('超阈值标 passes=false', () => {
    const psi = makePsi({
      crux: { lcpMs: 3200, inpMs: 250, cls: 0.2, hasFieldData: true },
    })
    const result = analyzeCwv(psi)
    expect(result.every((r) => r.passes === false)).toBe(true)
  })

  it('边界值（恰好等于阈值）算达标', () => {
    const psi = makePsi({
      crux: { lcpMs: CWV_LCP_MAX_MS, inpMs: CWV_INP_MAX_MS, cls: CWV_CLS_MAX, hasFieldData: true },
    })
    expect(analyzeCwv(psi).every((r) => r.passes)).toBe(true)
  })

  it('仅部分指标可用时只产出可用指标', () => {
    const psi = makePsi({
      crux: { lcpMs: 1800, inpMs: null, cls: null, hasFieldData: true },
    })
    const result = analyzeCwv(psi)
    expect(result).toHaveLength(1)
    expect(result[0].metric).toBe('LCP')
  })
})

describe('lighthouseClues', () => {
  it('返回顶部机会（默认限 5 条）', () => {
    const psi = makePsi({
      lighthouse: {
        performanceScore: 60,
        ttfbMs: null,
        opportunities: Array.from({ length: 7 }, (_, i) => ({
          id: `op-${i}`,
          title: `机会 ${i}`,
          savingsMs: (7 - i) * 100,
        })),
      },
    })
    const clues = lighthouseClues(psi)
    expect(clues).toHaveLength(5)
    expect(clues[0]).toEqual({ title: '机会 0', savingsMs: 700 })
  })

  it('无节省毫秒时省略 savingsMs 字段', () => {
    const psi = makePsi({
      lighthouse: {
        performanceScore: 60,
        ttfbMs: null,
        opportunities: [{ id: 'x', title: '仅标题' }],
      },
    })
    expect(lighthouseClues(psi)).toEqual([{ title: '仅标题' }])
  })

  it('无机会时返回空数组', () => {
    expect(lighthouseClues(makePsi({}))).toEqual([])
  })
})

describe('ttfbConcern', () => {
  it('无 TTFB 数据返回 null', () => {
    expect(ttfbConcern(makePsi({}))).toBeNull()
  })

  it('TTFB > 800ms 标 slow=true', () => {
    const psi = makePsi({ lighthouse: { performanceScore: null, opportunities: [], ttfbMs: 1200 } })
    expect(ttfbConcern(psi)).toEqual({ ttfbMs: 1200, slow: true })
  })

  it('TTFB 恰为阈值（800ms）不算慢', () => {
    const psi = makePsi({
      lighthouse: { performanceScore: null, opportunities: [], ttfbMs: TTFB_SLOW_MS },
    })
    expect(ttfbConcern(psi)).toEqual({ ttfbMs: TTFB_SLOW_MS, slow: false })
  })
})
