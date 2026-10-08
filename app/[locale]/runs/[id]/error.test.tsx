import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import zhMessages from '@/messages/zh.json'

const nav = vi.hoisted(() => ({ pathname: '/zh/runs/run_1/site' }))
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'zh', id: 'run_1' }),
  usePathname: () => nav.pathname,
}))
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => (zhMessages as unknown as Record<string, Record<string, string>>)[ns][key],
}))

const { default: RunError } = await import('./error')

describe('诊断工作区错误边界', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('标题 + 原因 + 重试（主按钮）；子页出错时返回诊断概览', () => {
    nav.pathname = '/zh/runs/run_1/site'
    const reset = vi.fn()
    render(<RunError error={new Error('boom')} reset={reset} />)
    expect(screen.getByRole('alert')).toHaveTextContent('这个页面没能加载')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(reset).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '重试' })).toHaveClass('ui-btn--primary')
    expect(screen.getByRole('link', { name: '返回诊断总览' })).toHaveAttribute('href', '/zh/runs/run_1')
    // 不向用户暴露 error.message
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })

  it('概览页本身出错时返回项目列表，不把人送回同一个出错页', () => {
    nav.pathname = '/zh/runs/run_1'
    render(<RunError error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByRole('link', { name: '返回项目列表' })).toHaveAttribute('href', '/zh/projects')
  })
})
