import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PillarBars } from './PillarBars'

// PillarBars：i18n-free 纯展示，Server Component 可用。改版去掉了数字滚动动画，分数直接显示终值。
const pillars = [
  { key: 'P1', label: 'P1 技术健康', score: 66.666 },
  { key: 'P4', label: 'P4 SERP', score: null },
  { key: 'P5', label: 'P5 权威/GEO', score: 31 },
]

describe('PillarBars', () => {
  it('各维度分数直接显示终值（小数保留一位），未评分显示文字而不是 0', () => {
    render(<PillarBars unscoredLabel="未评分" ariaLabel="5 个维度的健康分" pillars={pillars} />)
    expect(screen.getByText('P1 技术健康')).toBeInTheDocument()
    expect(screen.getByText('66.7')).toBeInTheDocument()
    expect(screen.getByText('31')).toBeInTheDocument()
    expect(screen.getByText('未评分')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '5 个维度的健康分' })).toBeInTheDocument()
  })

  it('传了 overallLabel 才显示总分行；总分为 null 时显示未评分', () => {
    const { rerender } = render(<PillarBars unscoredLabel="未评分" ariaLabel="a" pillars={[]} />)
    expect(screen.queryByText('总健康分')).not.toBeInTheDocument()
    rerender(<PillarBars overall={null} overallLabel="总健康分" unscoredLabel="未评分" ariaLabel="a" pillars={[]} />)
    expect(screen.getByText('总健康分')).toBeInTheDocument()
    expect(screen.getByText('未评分')).toBeInTheDocument()
  })

  it('条宽按 score/max 计算（默认 max=100）；未评分的维度不画条', () => {
    const { container } = render(
      <PillarBars unscoredLabel="未评分" ariaLabel="a" pillars={[{ key: 'P1', label: 'P1', score: 40 }, { key: 'P4', label: 'P4', score: null }]} />,
    )
    const fills = container.querySelectorAll('.ui-bar > i')
    expect(fills).toHaveLength(1)
    expect((fills[0] as HTMLElement).style.width).toBe('40%')
  })
})
