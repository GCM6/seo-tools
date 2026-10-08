import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvidenceBadge } from './EvidenceBadge'

describe('EvidenceBadge', () => {
  it('渲染调用方传入的文案（i18n-free）', () => {
    render(<EvidenceBadge grade="hard" label="实测" />)
    expect(screen.getByText('实测')).toBeInTheDocument()
  })

  it.each([
    ['hard', 'ui-ev--hard'],
    ['sample', 'ui-ev--sample'],
    ['inferred', 'ui-ev--inferred'],
    ['hypothesis', 'ui-ev--hypothesis'],
  ] as const)('等级 %s 映射到形状类 %s', (grade, cls) => {
    render(<EvidenceBadge grade={grade} label="x" />)
    expect(screen.getByText('x')).toHaveClass('ui-ev', cls)
  })

  it('hint 作为悬停说明，suffix 附在文案后', () => {
    render(<EvidenceBadge grade="sample" label="抽样实测" hint="按固定协议抽样测得" suffix="n=23" />)
    const badge = screen.getByText(/抽样实测/)
    expect(badge).toHaveAttribute('title', '按固定协议抽样测得')
    expect(badge).toHaveTextContent('抽样实测 · n=23')
  })
})
