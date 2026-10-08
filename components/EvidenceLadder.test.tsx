import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EvidenceLadder } from './EvidenceLadder'

// 「证据等级怎么读」：用正文里同一个 EvidenceBadge（形状区分）做图例，各配一句白话。i18n-free。
const levels = [
  { grade: 'hard' as const, label: '实测', desc: '有可复查的原始数据' },
  { grade: 'sample' as const, label: '抽样实测', desc: '按固定协议抽样测得' },
  { grade: 'inferred' as const, label: '推断', desc: '根据证据推出' },
  { grade: 'hypothesis' as const, label: '疑似', desc: '待验证的猜测' },
]

describe('EvidenceLadder', () => {
  it('每一级都是正文同款徽章 + 一句说明', () => {
    const { container } = render(<EvidenceLadder levels={levels} note="没有证据的说法不会写进报告。" />)
    for (const l of levels) {
      expect(screen.getByText(l.label)).toBeInTheDocument()
      expect(screen.getByText(l.desc)).toBeInTheDocument()
    }
    // 形状编码与正文一致：实测实心、抽样实测实心 ink-2、推断空心、疑似虚线。
    expect(container.querySelector('.ui-ev--hard')).toHaveTextContent('实测')
    expect(container.querySelector('.ui-ev--sample')).toHaveTextContent('抽样实测')
    expect(container.querySelector('.ui-ev--inferred')).toHaveTextContent('推断')
    expect(container.querySelector('.ui-ev--hypothesis')).toHaveTextContent('疑似')
    expect(screen.getByText('没有证据的说法不会写进报告。')).toBeInTheDocument()
  })
})
