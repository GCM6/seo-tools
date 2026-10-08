import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CodeBlock } from './CodeBlock'

describe('CodeBlock', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('复制整段代码，按钮显示「已复制」2 秒后恢复', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CodeBlock label="参考修复示例" code={'<meta name="robots" content="index" />'} copyLabel="复制代码" copiedLabel="已复制" />)

    expect(screen.getByText('<meta name="robots" content="index" />').closest('pre')).toHaveClass('ui-code')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
    })
    expect(writeText).toHaveBeenCalledWith('<meta name="robots" content="index" />')
    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('button', { name: '复制代码' })).toBeInTheDocument()
  })

  it('剪贴板被拒时不报错、不显示「已复制」', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) } })
    render(<CodeBlock code="x" copyLabel="复制代码" copiedLabel="已复制" wrap />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
    })
    expect(screen.queryByRole('button', { name: '已复制' })).not.toBeInTheDocument()
    expect(screen.getByText('x').closest('pre')).toHaveClass('ui-code--wrap')
  })
})
