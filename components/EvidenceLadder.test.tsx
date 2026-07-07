import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EvidenceLadder } from './EvidenceLadder'

// EvidenceLadder 是 i18n-free 纯展示：调用方 t() 后传入已翻译的 L0–L4 阶梯，
// tone 决定语义色（复用 .tag 变体 g/i/m），可直接用于 Server Component。
const levels = [
  { code: 'L0', name: '不可入库', desc: '不允许入库为结论', tone: 'g' as const },
  { code: 'L1', name: '假设', desc: '待验证', tone: 'g' as const },
  { code: 'L2', name: '推断', desc: '基于证据的推断', tone: 'i' as const },
  { code: 'L3', name: '样本实测', desc: '样本抽测', tone: 'm' as const },
  { code: 'L4', name: '硬证据实测', desc: 'GSC 硬证据', tone: 'm' as const },
]

describe('EvidenceLadder', () => {
  it('渲染标题与全部 5 级 L0–L4', () => {
    render(<EvidenceLadder title="证据等级" levels={levels} />)
    expect(screen.getByText('证据等级')).toBeInTheDocument()
    for (const l of levels) {
      expect(screen.getByText(l.code)).toBeInTheDocument()
      expect(screen.getByText(l.name)).toBeInTheDocument()
      expect(screen.getByText(l.desc)).toBeInTheDocument()
    }
  })

  it('tone 落到语义色类（m/i/g）', () => {
    const { container } = render(<EvidenceLadder title="证据等级" levels={levels} />)
    expect(container.querySelectorAll('.ladder-dot.m').length).toBe(2)
    expect(container.querySelectorAll('.ladder-dot.i').length).toBe(1)
    expect(container.querySelectorAll('.ladder-dot.g').length).toBe(2)
  })
})
