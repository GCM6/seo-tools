import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LocalTime } from './LocalTime'

describe('LocalTime', () => {
  it('默认显示到分钟，dateOnly 只显示日期（报告抬头用）', () => {
    const { rerender } = render(<LocalTime iso="2026-07-18T14:36:00.000Z" />)
    expect(screen.getByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)).toHaveAttribute('datetime', '2026-07-18T14:36:00.000Z')
    rerender(<LocalTime iso="2026-07-18T14:36:00.000Z" dateOnly />)
    expect(screen.getByText(/^\d{4}-\d{2}-\d{2}$/)).toBeInTheDocument()
  })
})
