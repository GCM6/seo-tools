import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CountUp } from './CountUp'

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('CountUp', () => {
  it('首次渲染显示初值', () => {
    mockReducedMotion(true)
    render(<CountUp value={12} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })
  it('reduced-motion 下更新 value 直接显终值', () => {
    mockReducedMotion(true)
    const { rerender } = render(<CountUp value={0} />)
    rerender(<CountUp value={37} />)
    expect(screen.getByText('37')).toBeInTheDocument()
  })
})
