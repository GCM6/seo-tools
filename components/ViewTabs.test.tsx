import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ViewTabs, viewPanelId, viewTabId } from './ViewTabs'

function Harness() {
  const [value, setValue] = useState('a')
  return (
    <>
      <ViewTabs
        idBase="t"
        label="视图"
        tabs={[
          { id: 'a', label: '来源', count: 29 },
          { id: 'b', label: '论点审核', count: 0 },
          { id: 'c', label: '正式知识' },
        ]}
        value={value}
        onChange={setValue}
      />
      <div role="tabpanel" id={viewPanelId('t', value)} aria-labelledby={viewTabId('t', value)}>
        {`panel-${value}`}
      </div>
    </>
  )
}

describe('ViewTabs（页内视图标签）', () => {
  it('计数显示在标签里，0 也显示；面板由选中的标签命名', () => {
    render(<Harness />)
    expect(screen.getByRole('tab', { name: '来源 29' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '论点审核 0' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: '来源 29' })).toHaveTextContent('panel-a')
  })

  it('方向键循环切换并移动焦点，End / Home 到两端', () => {
    render(<Harness />)
    const first = screen.getByRole('tab', { name: '来源 29' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '正式知识' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('panel-c')
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'End' })
    expect(screen.getByRole('tab', { name: '正式知识' })).toHaveAttribute('tabindex', '0')
    expect(first).toHaveAttribute('tabindex', '-1')
  })
})
