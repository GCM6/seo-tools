import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewAnalysisModes } from './NewAnalysisModes'

const labels = { label: '开始方式', site: '诊断一个网站', goal: '从一个问题开始' }

function renderModes() {
  return render(
    <NewAnalysisModes
      labels={labels}
      site={<input aria-label="网址" defaultValue="" />}
      goal={<textarea aria-label="你想解决什么问题？" />}
    />,
  )
}

describe('NewAnalysisModes（新建分析的二选一开始方式）', () => {
  it('默认选中「诊断一个网站」，另一个面板隐藏', () => {
    renderModes()
    expect(screen.getByRole('tablist', { name: '开始方式' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '诊断一个网站' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '从一个问题开始' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel', { name: '诊断一个网站' })).toBeVisible()
    expect(screen.getByLabelText('你想解决什么问题？').closest('[role="tabpanel"]')).not.toBeVisible()
  })

  it('切换后再切回来，已经填的内容还在（两个面板都保持挂载）', () => {
    renderModes()
    fireEvent.change(screen.getByLabelText('网址'), { target: { value: 'metadocu.com' } })
    fireEvent.click(screen.getByRole('tab', { name: '从一个问题开始' }))
    expect(screen.getByRole('tabpanel', { name: '从一个问题开始' })).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: '诊断一个网站' }))
    expect(screen.getByLabelText('网址')).toHaveValue('metadocu.com')
  })

  it('方向键切换标签并移动焦点；只有选中的标签在 Tab 序列里', () => {
    renderModes()
    const site = screen.getByRole('tab', { name: '诊断一个网站' })
    const goal = screen.getByRole('tab', { name: '从一个问题开始' })
    expect(site).toHaveAttribute('tabindex', '0')
    expect(goal).toHaveAttribute('tabindex', '-1')
    site.focus()
    fireEvent.keyDown(site, { key: 'ArrowRight' })
    expect(goal).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(goal)
    fireEvent.keyDown(goal, { key: 'Home' })
    expect(site).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(site)
  })
})
