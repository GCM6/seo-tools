import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { GoalAnalysisLauncher } from './GoalAnalysisLauncher'
import zhMessages from '@/messages/zh.json'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

function renderLauncher() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <GoalAnalysisLauncher locale="zh" />
    </NextIntlClientProvider>,
  )
}

function respond(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
}

const goalBox = () => screen.getByLabelText('你想解决什么问题？')
const submitButton = () => screen.getByRole('button', { name: '生成诊断路线' })

describe('GoalAnalysisLauncher（从一个问题开始）', () => {
  beforeEach(() => pushMock.mockReset())

  it('没写问题时不能提交', () => {
    renderLauncher()
    expect(submitButton()).toBeDisabled()
    fireEvent.change(goalBox(), { target: { value: '流量突然下降' } })
    expect(submitButton()).not.toBeDisabled()
  })

  it('建了诊断就进诊断工作区，只建了会话就进会话页', async () => {
    respond(201, { id: 'session_1', runId: 'run_1' })
    renderLauncher()
    fireEvent.change(goalBox(), { target: { value: '流量突然下降' } })
    fireEvent.click(submitButton())
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/zh/runs/run_1'))

    respond(201, { id: 'session_2' })
    fireEvent.click(submitButton())
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/zh/sessions/session_2'))
  })

  it('请求体带去掉首尾空格的问题，域名留空时不发', async () => {
    respond(201, { id: 'session_1' })
    renderLauncher()
    fireEvent.change(goalBox(), { target: { value: '  学习 GEO 基础  ' } })
    fireEvent.click(submitButton())
    await waitFor(() => expect(pushMock).toHaveBeenCalled())
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    expect(body).toEqual({ goal: '学习 GEO 基础' })
  })

  it('错误码换成能看懂的话，不露出原始码，也不跳转', async () => {
    respond(422, { error: 'invalid_domain' })
    renderLauncher()
    fireEvent.change(goalBox(), { target: { value: '流量突然下降' } })
    fireEvent.change(screen.getByLabelText('域名（可选）'), { target: { value: 'bad' } })
    fireEvent.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('域名格式不对，例如 example.com。')
    expect(screen.queryByText(/invalid_domain/)).toBeNull()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('未知错误和网络失败都给通用提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    renderLauncher()
    fireEvent.change(goalBox(), { target: { value: '流量突然下降' } })
    fireEvent.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('没能生成诊断路线，请稍后重试。')
  })
})
