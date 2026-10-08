import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShareButton } from './ShareButton'

const labels = {
  label: '生成分享链接',
  copyLabel: '复制',
  copiedLabel: '已复制 ✓',
  readyLabel: '只读链接已生成',
  errorLabel: '生成失败，请重试',
}

describe('ShareButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('生成成功：显示完整链接（当前域名 + 接口返回的路径），可复制', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ url: '/share/tok_1' }), { status: 200 }))))
    render(<ShareButton runId="run_1" locale="zh" {...labels} />)

    fireEvent.click(screen.getByRole('button', { name: '生成分享链接' }))
    const input = await screen.findByRole('textbox', { name: '只读链接已生成' })
    expect(input).toHaveValue(`${window.location.origin}/share/tok_1`)
    expect(fetch).toHaveBeenCalledWith('/api/runs/run_1/share?locale=zh', { method: 'POST' })

    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(await screen.findByRole('button', { name: '已复制 ✓' })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share/tok_1`)
  })

  it('生成失败：按钮旁写明失败，按钮仍可重试（原来是静默无反应）', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))))
    render(<ShareButton runId="run_1" locale="zh" {...labels} />)

    fireEvent.click(screen.getByRole('button', { name: '生成分享链接' }))
    expect(await screen.findByText('生成失败，请重试')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生成分享链接' })).not.toBeDisabled()
  })

  it('网络错误同样提示失败', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    render(<ShareButton runId="run_1" locale="zh" {...labels} />)
    fireEvent.click(screen.getByRole('button', { name: '生成分享链接' }))
    expect(await screen.findByText('生成失败，请重试')).toBeInTheDocument()
  })
})
