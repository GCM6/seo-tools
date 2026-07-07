import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AnimatedList } from './AnimatedList'

describe('AnimatedList', () => {
  it('渲染各项且带滑入 class', () => {
    render(<AnimatedList items={[{ key: 'a', node: <span>A 事件</span> }, { key: 'b', node: <span>B 事件</span> }]} />)
    expect(screen.getByText('A 事件')).toBeInTheDocument()
    expect(screen.getByText('B 事件').closest('li')).toHaveClass('fx-slide-in')
  })
})
