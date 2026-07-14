import { describe, it, expect } from 'vitest'
import { wilsonLowerBound } from './wilson'

describe('wilsonLowerBound', () => {
  it('returns 0 for empty samples', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0)
  })

  it('is below the point estimate for small samples even at 100% success', () => {
    const lb = wilsonLowerBound(3, 3)
    expect(lb).toBeGreaterThan(0)
    expect(lb).toBeLessThan(1)
  })

  it('approaches the point estimate as sample size grows', () => {
    const lb = wilsonLowerBound(90, 100)
    expect(lb).toBeGreaterThan(0.8)
    expect(lb).toBeLessThan(0.9)
  })

  it('never goes negative', () => {
    expect(wilsonLowerBound(0, 5)).toBeGreaterThanOrEqual(0)
  })
})
