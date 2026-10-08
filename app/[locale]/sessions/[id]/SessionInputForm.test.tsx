import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { SessionInputForm } from './SessionInputForm'
import zhMessages from '@/messages/zh.json'

function renderForm(missingFields: string[]) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <SessionInputForm sessionId="s1" locale="zh" missingFields={missingFields} />
    </NextIntlClientProvider>,
  )
}

const pushMock = vi.fn()
const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }))

describe('SessionInputForm（SP-A §3.5：闸门要求补充品类/市场）', () => {
  beforeEach(() => {
    pushMock.mockReset()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ runId: 'run_9' }), { status: 200 })))
  })

  it('industry 渲染英文品类输入，market 渲染 10 个英文市场下拉', () => {
    renderForm(['industry', 'market'])
    expect(screen.getByLabelText('产品/服务品类（英文）')).toBeInTheDocument()
    expect((screen.getByLabelText('目标市场') as HTMLSelectElement).options).toHaveLength(10)
  })

  it('品类不合规时禁用提交并提示；合规后提交品类与市场 code', async () => {
    renderForm(['industry', 'market'])
    const submit = screen.getByRole('button', { name: /补充并继续/ })
    fireEvent.change(screen.getByLabelText('产品/服务品类（英文）'), { target: { value: '文档工具' } })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/请用英文描述/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('产品/服务品类（英文）'), { target: { value: 'document metadata removal tool' } })
    fireEvent.change(screen.getByLabelText('目标市场'), { target: { value: 'gb' } })
    fireEvent.click(submit)
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/zh/runs/run_9'))
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ industry: 'document metadata removal tool', market: 'gb' })
  })

  it('服务端拒绝时给可读提示，不露出错误码', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_domain' }), { status: 422 })))
    renderForm(['domain'])
    fireEvent.change(screen.getByLabelText('域名'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: '补充并继续' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('域名格式不对，例如 example.com。')
    expect(screen.queryByText(/invalid_domain/)).toBeNull()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('既有字段（domain）仍是普通文本输入', () => {
    renderForm(['domain'])
    expect(screen.getByLabelText('域名')).toHaveProperty('tagName', 'INPUT')
  })
})
