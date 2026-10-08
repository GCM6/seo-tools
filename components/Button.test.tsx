import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button, ButtonLink, buttonClass } from './Button'

describe('buttonClass', () => {
  it('次级按钮是默认变体，不额外加修饰类', () => {
    expect(buttonClass()).toBe('ui-btn')
  })

  it('按变体、尺寸、纯图标拼出修饰类', () => {
    expect(buttonClass({ variant: 'primary', size: 'sm', iconOnly: true, className: 'x' })).toBe(
      'ui-btn ui-btn--primary ui-btn--sm ui-btn--icon x',
    )
  })
})

describe('Button', () => {
  it('默认 type=button，避免在表单里误提交', () => {
    render(<Button>保存</Button>)
    expect(screen.getByRole('button', { name: '保存' })).toHaveAttribute('type', 'button')
  })

  it('loading 时禁用、标记 aria-busy，并且不再触发点击', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        保存
      </Button>,
    )
    const btn = screen.getByRole('button', { name: '保存' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('ButtonLink', () => {
  it('渲染为带按钮样式的链接', () => {
    render(
      <ButtonLink href="/zh/new" variant="primary">
        新建分析
      </ButtonLink>,
    )
    const link = screen.getByRole('link', { name: '新建分析' })
    expect(link).toHaveAttribute('href', '/zh/new')
    expect(link.className).toBe('ui-btn ui-btn--primary')
  })
})
