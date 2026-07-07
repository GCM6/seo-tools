import { describe, it, expect } from 'vitest'
import { estimateRun } from './estimate'

const base = { engineCount: 4, promptCount: 20, n: 5, gsc: true, render: true }

describe('estimateRun', () => {
  it('probeCalls = engineCount × promptCount × n（对齐 run-probes 三层循环）', () => {
    expect(estimateRun(base).probeCalls).toBe(400)
    expect(estimateRun({ ...base, engineCount: 1 }).probeCalls).toBe(100)
    expect(estimateRun({ ...base, engineCount: 0 }).probeCalls).toBe(0)
  })

  it('成本区间非负、high ≥ low，probeCalls>0 时 high>low', () => {
    const e = estimateRun(base)
    expect(e.costLowUsd).toBeGreaterThanOrEqual(0)
    expect(e.costHighUsd).toBeGreaterThan(e.costLowUsd)
  })

  it('零引擎时探针成本为 0', () => {
    const e = estimateRun({ ...base, engineCount: 0 })
    expect(e.costLowUsd).toBe(0)
    expect(e.costHighUsd).toBe(0)
  })

  it('引擎越多成本与调用数单调不减', () => {
    const few = estimateRun({ ...base, engineCount: 1 })
    const many = estimateRun({ ...base, engineCount: 4 })
    expect(many.probeCalls).toBeGreaterThan(few.probeCalls)
    expect(many.costHighUsd).toBeGreaterThan(few.costHighUsd)
  })

  it('耗时区间有下限、low<high、随调用数增大', () => {
    const e = estimateRun(base)
    expect(e.timeLowMin).toBeGreaterThanOrEqual(1)
    expect(e.timeHighMin).toBeGreaterThan(e.timeLowMin)
    const heavier = estimateRun({ ...base, engineCount: 8 })
    expect(heavier.timeHighMin).toBeGreaterThanOrEqual(e.timeHighMin)
  })

  it('即便零引擎也有最低耗时（抓取/渲染/GSC 开销）', () => {
    const e = estimateRun({ engineCount: 0, promptCount: 20, n: 5, gsc: true, render: true })
    expect(e.timeHighMin).toBeGreaterThanOrEqual(1)
  })

  it('成本四舍五入到 2 位小数', () => {
    const e = estimateRun(base)
    expect(Number(e.costLowUsd.toFixed(2))).toBe(e.costLowUsd)
    expect(Number(e.costHighUsd.toFixed(2))).toBe(e.costHighUsd)
  })
})
