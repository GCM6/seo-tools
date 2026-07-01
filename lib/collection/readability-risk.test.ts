import { describe, it, expect } from 'vitest'
import { computeMainContentDelta } from './readability-risk'

describe('computeMainContentDelta', () => {
  it('is positive when rendering reveals more text than the initial HTML', () => {
    expect(computeMainContentDelta(0, 1200)).toBe(1200)
  })
  it('is zero when initial and rendered text match', () => {
    expect(computeMainContentDelta(500, 500)).toBe(0)
  })
  it('can be negative when rendering strips text (rare but valid)', () => {
    expect(computeMainContentDelta(500, 300)).toBe(-200)
  })
})
