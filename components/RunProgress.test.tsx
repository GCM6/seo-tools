import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { RunProgress } from './RunProgress'
import zhMessages from '@/messages/zh.json'

// 诊断完成后的「下一步」已移到工作区抬头的主动作（lib/runs/workspace.ts 的 nextAction，另有单测），
// 本组件只负责运行中 / 刚完成 / 失败三种状态。
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

// 采集中会订阅 SSE；jsdom 没有 EventSource，用一个只记录构造的替身。
class FakeEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  close() {}
}

function renderProgress(props: Partial<Parameters<typeof RunProgress>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <RunProgress runId="run_a" initialStatus="output" {...props} />
    </NextIntlClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RunProgress 完成态', () => {
  it('渲染完成标题与带样式的「查看诊断结果」主按钮（不是裸 button）', () => {
    renderProgress()
    expect(screen.getByRole('heading', { name: '诊断证据已就绪' })).toBeInTheDocument()
    const viewResultsBtn = screen.getByRole('button', { name: '查看诊断结果' })
    expect(viewResultsBtn).toHaveClass('ui-btn', 'ui-btn--primary')
  })

  it('不再渲染兼做导航的大号渐变 CTA', () => {
    renderProgress()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('RunProgress 失败态', () => {
  it('错误原因用 role=alert 的提示条展示，重试按钮带样式', () => {
    renderProgress({ initialStatus: 'failed', initialFailureReason: 'timeout' })
    expect(screen.getByRole('alert')).toHaveTextContent('timeout')
    expect(screen.getByRole('button', { name: '重试采集' })).toHaveClass('ui-btn', 'ui-btn--primary')
  })

  it('回测 run 不能直接重试（409 retest_retry_unsupported）：说明原因并链到项目页重新发起回测（最终审查 F5-1）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'retest_retry_unsupported', projectId: 'proj_1' }), { status: 409 })))
    renderProgress({ initialStatus: 'failed', initialFailureReason: 'timeout' })
    fireEvent.click(screen.getByRole('button', { name: '重试采集' }))
    const link = await screen.findByRole('link', { name: /回测不能直接重试/ })
    expect(link).toHaveAttribute('href', '/zh/projects/proj_1')
    expect(screen.queryByText('重试失败，请稍后再试。')).toBeNull()
  })

  it('重试被建 run 闸门拒绝（422 market_required，SP-A §3.5）：链到向导补充项目设置', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'market_required', projectId: 'proj_1' }), { status: 422 })))
    renderProgress({ initialStatus: 'failed', initialFailureReason: 'timeout' })
    fireEvent.click(screen.getByRole('button', { name: '重试采集' }))
    const link = await screen.findByRole('link', { name: /品类\/市场未设置/ })
    expect(link).toHaveAttribute('href', '/zh/new?projectId=proj_1')
  })
})

describe('RunProgress 采集中：中止诊断用行内两步确认（不用 window.confirm）', () => {
  it('第一次点击只显示确认语与两个按钮；点「继续诊断」收回，不发请求', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderProgress({ initialStatus: 'collecting' })

    fireEvent.click(screen.getByRole('button', { name: '中止诊断' }))
    expect(screen.getByText('要中止本轮诊断吗？已采集的证据会保留。')).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '继续诊断' }))
    expect(screen.queryByText('要中止本轮诊断吗？已采集的证据会保留。')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('确认后才 POST 到 cancel 端点', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    renderProgress({ initialStatus: 'collecting' })

    fireEvent.click(screen.getByRole('button', { name: '中止诊断' }))
    const buttons = screen.getAllByRole('button', { name: '中止诊断' })
    fireEvent.click(buttons[buttons.length - 1])
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/runs/run_a/cancel', { method: 'POST' }))
  })
})
