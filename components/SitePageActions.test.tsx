import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SitePageActions } from './SitePageActions'

const labels = { mark: '标记重点页', unmark: '取消重点页', notice: '更改将在下次 run 生效' }

describe('SitePageActions', () => {
  it('渲染标记按钮并在点击时回调 action', () => {
    const onToggle = vi.fn()
    render(<SitePageActions pageId="sp_1" isKeyPage={false} onToggleKeyPage={onToggle} labels={labels} />)
    fireEvent.click(screen.getByRole('button', { name: '标记重点页' }))
    expect(onToggle).toHaveBeenCalledWith('sp_1', true)
  })

  it('已是重点页时显示取消文案', () => {
    render(<SitePageActions pageId="sp_1" isKeyPage={true} onToggleKeyPage={vi.fn()} labels={labels} />)
    expect(screen.getByRole('button', { name: '取消重点页' })).toBeDefined()
  })
})
