import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Term } from './Term'

// Term 是 i18n-free 纯展示：调用方 t() 后传入已翻译的 explain 文案，无 hook，
// 可直接用于 Server Component（同 components/ProvenanceTag.tsx 惯例）。
describe('Term', () => {
  it('渲染术语文本，并通过 title 暴露解释', () => {
    render(<Term explain="canonical 是网页里标注以哪个网址为准的记号">canonical</Term>)
    const abbr = screen.getByText('canonical')
    expect(abbr).toBeInTheDocument()
    expect(abbr).toHaveAttribute('title', 'canonical 是网页里标注以哪个网址为准的记号')
    expect(abbr.tagName).toBe('ABBR')
  })

  it('aria-describedby 指向的隐藏节点包含同一段解释文案', () => {
    render(<Term explain="noindex 是不要收录我的指令">noindex</Term>)
    const abbr = screen.getByText('noindex')
    const describedById = abbr.getAttribute('aria-describedby')
    expect(describedById).toBeTruthy()
    const desc = document.getElementById(describedById!)
    expect(desc).toHaveTextContent('noindex 是不要收录我的指令')
  })

  it('不同 explain 文案生成不同的 aria-describedby id（不会互相覆盖）', () => {
    render(
      <>
        <Term explain="解释 A">词 A</Term>
        <Term explain="解释 B">词 B</Term>
      </>,
    )
    const idA = screen.getByText('词 A').getAttribute('aria-describedby')
    const idB = screen.getByText('词 B').getAttribute('aria-describedby')
    expect(idA).not.toBe(idB)
  })

  it('携带 .term 样式类（虚线下划线视觉标记）', () => {
    render(<Term explain="解释">术语</Term>)
    expect(screen.getByText('术语')).toHaveClass('term')
  })
})
