import { describe, it, expect } from 'vitest'
import { impressionWeightedAvgPosition } from './avg-position'

describe('impressionWeightedAvgPosition', () => {
  it('展示量加权：高展示词主导', () => {
    // (2*100 + 10*10)/110 = 300/110 = 2.727 → 2.7
    expect(impressionWeightedAvgPosition([
      { position: 2, impressions: 100 },
      { position: 10, impressions: 10 },
    ])).toBe(2.7)
  })
  it('空行或零展示 → null（无信号）', () => {
    expect(impressionWeightedAvgPosition([])).toBeNull()
    expect(impressionWeightedAvgPosition([{ position: 5, impressions: 0 }])).toBeNull()
  })
  it('四舍五入到一位小数', () => {
    expect(impressionWeightedAvgPosition([{ position: 3.14159, impressions: 5 }])).toBe(3.1)
  })
})
