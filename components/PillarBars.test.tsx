import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PillarBars } from './PillarBars'

// PillarBars 是 i18n-free 纯展示：调用方 t() 后传入已翻译 label / 分数，
// 内部组合 CountUp（client 叶子，SSR 落终值），组件本身可用于 Server Component。
const pillars = [
  { key: 'P1', label: 'P1 技术健康', score: 72 },
  { key: 'P4', label: 'P4 SERP', score: null },
  { key: 'P5', label: 'P5 权威/GEO', score: 31 },
]

describe('PillarBars', () => {
  it('渲染总分与各支柱分数', () => {
    render(
      <PillarBars
        overall={68}
        overallLabel="总健康分"
        unscoredLabel="未评分"
        ariaLabel="五支柱健康分"
        pillars={pillars}
      />,
    )
    expect(screen.getByText('总健康分')).toBeInTheDocument()
    expect(screen.getByText('68')).toBeInTheDocument()
    expect(screen.getByText('P1 技术健康')).toBeInTheDocument()
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getByText('31')).toBeInTheDocument()
  })

  it('score 为 null 的支柱显示未评分而非数字', () => {
    render(
      <PillarBars
        overall={68}
        overallLabel="总健康分"
        unscoredLabel="未评分"
        ariaLabel="五支柱健康分"
        pillars={pillars}
      />,
    )
    expect(screen.getByText('未评分')).toBeInTheDocument()
  })

  it('overall 为 null 时总分显示未评分', () => {
    render(
      <PillarBars
        overall={null}
        overallLabel="总健康分"
        unscoredLabel="未评分"
        ariaLabel="五支柱健康分"
        pillars={[]}
      />,
    )
    expect(screen.getByText('未评分')).toBeInTheDocument()
  })

  it('条形组带 aria-label', () => {
    render(
      <PillarBars
        overall={68}
        overallLabel="总健康分"
        unscoredLabel="未评分"
        ariaLabel="五支柱健康分"
        pillars={pillars}
      />,
    )
    expect(screen.getByRole('img', { name: '五支柱健康分' })).toBeInTheDocument()
  })

  it('条宽按 score/max 计算（default max=100）', () => {
    const { container } = render(
      <PillarBars
        overall={68}
        overallLabel="总健康分"
        unscoredLabel="未评分"
        ariaLabel="五支柱健康分"
        pillars={[{ key: 'P1', label: 'P1', score: 40 }]}
      />,
    )
    const fill = container.querySelector('.pbar-fill') as HTMLElement
    expect(fill).toBeTruthy()
    expect(fill.style.width).toBe('40%')
  })
})
