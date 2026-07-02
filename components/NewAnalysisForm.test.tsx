import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { NewAnalysisForm } from './NewAnalysisForm'
import zhMessages from '@/messages/zh.json'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

function renderForm() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <NewAnalysisForm locale="zh" />
    </NextIntlClientProvider>,
  )
}

describe('NewAnalysisForm visibility', () => {
  // globals.css 里 .screen { display:none }，只有 .screen.show 才可见（见屏2）。
  // 缺 show 会导致整屏表单被 display:none 隐藏——回归此前屏1 空白的 bug。
  it('renders the screen with the `show` class so it is not display:none', () => {
    const { container } = render(
      <NextIntlClientProvider locale="zh" messages={zhMessages}>
        <NewAnalysisForm locale="zh" />
      </NextIntlClientProvider>,
    )
    expect(container.querySelector('section.screen')).toHaveClass('show')
  })
})

describe('NewAnalysisForm submit', () => {
  beforeEach(() => {
    pushMock.mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/projects') return new Response(JSON.stringify({ id: 'proj_x' }), { status: 201 })
        if (url === '/api/runs') return new Response(JSON.stringify({ id: 'run_y' }), { status: 201 })
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )
  })

  it('creates a project then a run, and navigates to the new run', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('网址'), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByText(/开始诊断/))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/zh/runs/run_y'))

    const calls = vi.mocked(fetch).mock.calls
    expect(calls[0][0]).toBe('/api/projects')
    expect(calls[1][0]).toBe('/api/runs')
    expect(JSON.parse(calls[1][1]?.body as string)).toMatchObject({ projectId: 'proj_x', runType: 'baseline' })
  })

  it('shows an error message when project creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    renderForm()
    fireEvent.click(screen.getByText(/开始诊断/))
    await waitFor(() => expect(screen.getByText('创建分析失败，请重试。')).toBeInTheDocument())
    expect(pushMock).not.toHaveBeenCalled()
  })

  // 后端 422 invalid_domain / domain_required 时要提示用户改地址，
  // 而不是笼统的「请重试」——重试同样的输入不会成功。
  it('shows a domain-specific error for an invalid domain (422)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_domain' }), { status: 422 })),
    )
    renderForm()
    fireEvent.click(screen.getByText(/开始诊断/))
    await waitFor(() => expect(screen.getByText('站点地址无效，请检查后重试。')).toBeInTheDocument())
    expect(pushMock).not.toHaveBeenCalled()
  })

  // 后端 503 dispatch_failed（Inngest 不可用）要给出可行动的提示，
  // 区别于笼统失败——回归「本地未启动 Inngest dev server」场景。
  it('shows a dispatch-specific error when the run event dispatch fails (503)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/projects') return new Response(JSON.stringify({ id: 'proj_x' }), { status: 201 })
        return new Response(JSON.stringify({ error: 'dispatch_failed' }), { status: 503 })
      }),
    )
    renderForm()
    fireEvent.change(screen.getByLabelText('网址'), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByText(/开始诊断/))
    await waitFor(() =>
      expect(screen.getByText('采集任务派发失败：后台任务服务（Inngest）不可用，请启动后重试。')).toBeInTheDocument(),
    )
    expect(pushMock).not.toHaveBeenCalled()
  })
})
