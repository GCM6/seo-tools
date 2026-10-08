import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShowMoreRows } from './ShowMoreRows'

const head = (
  <thead>
    <tr>
      <th>知识</th>
    </tr>
  </thead>
)
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => (
    <tr key={i}>
      <td>{`row-${i + 1}`}</td>
    </tr>
  ))

describe('ShowMoreRows', () => {
  it('超过 limit 行时只显示前 limit 行，按钮展开 / 收起其余行', () => {
    render(<ShowMoreRows head={head} rows={rows(12)} limit={10} labels={{ showAll: '显示全部 12 条', showLess: '收起' }} />)
    expect(screen.getAllByRole('row')).toHaveLength(11) // 表头 + 10 行
    expect(screen.queryByText('row-11')).toBeNull()
    const toggle = screen.getByRole('button', { name: '显示全部 12 条' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByText('row-12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('不超过 limit 行时不出现按钮', () => {
    render(<ShowMoreRows head={head} rows={rows(3)} labels={{ showAll: '显示全部 3 条', showLess: '收起' }} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
