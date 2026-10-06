import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RetestButton } from './RetestButton'

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

const labels = {
  cta: '发起回测',
  starting: '发起中…',
  error: '发起失败，请重试',
  inProgress: '已有诊断进行中，查看',
}

afterEach(() => {
  vi.unstubAllGlobals()
  pushMock.mockClear()
})

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ status, ok: status >= 200 && status < 300, json: async () => body })),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 201, ok: true, json: async () => ({}) })))
})

describe('RetestButton', () => {
  it('201：POST 到 retest 端点并跳转到新 run', async () => {
    mockFetch(201, { baselineRunId: 'run_base', retest: { id: 'run_new' } })
    render(<RetestButton locale="zh" baselineRunId="run_base" labels={labels} />)

    fireEvent.click(screen.getByRole('button', { name: '发起回测' }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/zh/runs/run_new'))
  })

  it('409：显示进行中文案并链接到返回的 runId', async () => {
    mockFetch(409, { error: 'run_in_progress', runId: 'run_wip' })
    render(<RetestButton locale="zh" baselineRunId="run_base" labels={labels} />)

    fireEvent.click(screen.getByRole('button', { name: '发起回测' }))

    const link = await screen.findByRole('link', { name: '已有诊断进行中，查看' })
    expect(link).toHaveAttribute('href', '/zh/runs/run_wip')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('422 品类/市场未设置（SP-A §3.5）：链到向导补充项目设置', async () => {
    mockFetch(422, { error: 'category_required', projectId: 'proj_1' })
    render(<RetestButton locale="zh" baselineRunId="run_base" labels={{ ...labels, needsSetup: '项目品类/市场未设置，先补充' }} />)
    fireEvent.click(screen.getByRole('button', { name: '发起回测' }))
    const link = await screen.findByRole('link', { name: '项目品类/市场未设置，先补充' })
    expect(link).toHaveAttribute('href', '/zh/new?projectId=proj_1')
  })

  it('422 但调用方没给 needsSetup 文案：链接回落到错误文案', async () => {
    mockFetch(422, { error: 'market_required', projectId: 'proj_1' })
    render(<RetestButton locale="zh" baselineRunId="run_base" labels={labels} />)
    fireEvent.click(screen.getByRole('button', { name: '发起回测' }))
    expect(await screen.findByRole('link', { name: '发起失败，请重试' })).toHaveAttribute('href', '/zh/new?projectId=proj_1')
  })

  it('5xx：显示错误文案', async () => {
    mockFetch(503, { error: 'dispatch_failed' })
    render(<RetestButton locale="zh" baselineRunId="run_base" labels={labels} />)

    fireEvent.click(screen.getByRole('button', { name: '发起回测' }))

    await screen.findByText('发起失败，请重试')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('网络异常：显示错误文案', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    render(<RetestButton locale="zh" baselineRunId="run_base" labels={labels} />)

    fireEvent.click(screen.getByRole('button', { name: '发起回测' }))

    await screen.findByText('发起失败，请重试')
  })

  it('请求期间按钮禁用并显示发起中文案', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      ),
    )
    render(<RetestButton locale="zh" baselineRunId="run_base" labels={labels} />)

    fireEvent.click(screen.getByRole('button', { name: '发起回测' }))

    const button = await screen.findByRole('button', { name: '发起中…' })
    expect(button).toBeDisabled()

    resolveFetch({ status: 201, ok: true, json: async () => ({ retest: { id: 'run_new' } }) })
    await waitFor(() => expect(pushMock).toHaveBeenCalled())
  })

  it('disabled=true：按钮渲染为禁用态，点击不发起请求', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<RetestButton locale="zh" baselineRunId="run_base" labels={labels} disabled />)

    const button = screen.getByRole('button', { name: '发起回测' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
