import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { SettingsClient } from './SettingsClient'
import type { DataSourceStatus } from '@/lib/settings/data-sources'
import zhMessages from '@/messages/zh.json'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

const statuses: DataSourceStatus[] = [
  { key: 'googleCse', configured: false },
  { key: 'aiProbe', configured: true, detail: '1/4' },
  { key: 'dataforseo', configured: true },
  { key: 'psi', configured: true },
]

function renderPage(props: { dbKeys?: string[]; envKeys?: string[] } = {}) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <SettingsClient statuses={statuses} dbKeys={props.dbKeys ?? ['OPENAI_API_KEY']} envKeys={props.envKeys ?? ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD']} />
    </NextIntlClientProvider>,
  )
}

const panel = (title: string) => screen.getByRole('region', { name: title })

describe('SettingsClient（设置：每个数据源一块面板）', () => {
  beforeEach(() => refreshMock.mockReset())

  it('面板状态分四种：未接入 / 已接入 / 读取环境变量 / 开箱即用', () => {
    renderPage()
    expect(within(panel('Google 可见性检索 (CSE)')).getByText('未接入')).toBeInTheDocument()
    expect(within(panel('AI 答案引擎探针')).getByText('已接入')).toBeInTheDocument()
    expect(within(panel('AI 答案引擎探针')).getByText('已配置 1 个 AI 引擎，诊断时会用它们实测回答。')).toBeInTheDocument()
    expect(within(panel('DataForSEO（关键词/竞品/外链）')).getByText('读取环境变量')).toBeInTheDocument()
    expect(within(panel('PageSpeed / CWV')).getByText('开箱即用')).toBeInTheDocument()
  })

  it('配置指南是折叠块，没有 emoji 小标题', () => {
    renderPage()
    const guide = within(panel('Google 可见性检索 (CSE)')).getByText('配置指南').closest('details')!
    expect(guide).not.toHaveAttribute('open')
    expect(guide.textContent).toContain('为什么要配置')
    expect(guide.textContent).not.toMatch(/[🎯🚀📋]/u)
    expect(within(guide).getByRole('link', { name: 'https://cse.google.com/cse/' })).toBeInTheDocument()
  })

  it('填了新值才能保存；保存成功后提示并刷新', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    renderPage()
    const cse = panel('Google 可见性检索 (CSE)')
    const save = within(cse).getByRole('button', { name: '保存' })
    expect(save).toBeDisabled()
    fireEvent.change(within(cse).getByLabelText('搜索引擎 ID（CX）'), { target: { value: 'cx_123' } })
    fireEvent.click(save)
    expect(await within(cse).findByText('已保存')).toBeInTheDocument()
    expect(refreshMock).toHaveBeenCalled()
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({ credentialKey: 'GOOGLE_CSE_CX', value: 'cx_123' })
  })

  it('保存失败时说明是哪个字段、什么原因', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'value_too_long' }), { status: 422 })))
    renderPage()
    const cse = panel('Google 可见性检索 (CSE)')
    fireEvent.change(within(cse).getByLabelText('API Key'), { target: { value: 'x' } })
    fireEvent.click(within(cse).getByRole('button', { name: '保存' }))
    expect(await within(cse).findByRole('alert')).toHaveTextContent('API Key 没有保存成功（value_too_long）。')
  })

  it('清除已保存的 key 要再确认一次', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    renderPage()
    const ai = panel('AI 答案引擎探针')
    fireEvent.click(within(ai).getByRole('button', { name: '清除' }))
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.click(within(ai).getByRole('button', { name: '确认清除' }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    const calls = vi.mocked(fetch).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][1]?.method).toBe('DELETE')
    expect(JSON.parse(calls[0][1]?.body as string)).toEqual({ credentialKey: 'OPENAI_API_KEY' })
  })

  it('密钥字段默认隐藏，可以用键盘切换显示', () => {
    renderPage()
    const input = within(panel('AI 答案引擎探针')).getByLabelText('OpenAI API Key')
    expect(input).toHaveAttribute('type', 'password')
    const toggle = within(panel('AI 答案引擎探针')).getByRole('button', { name: '显示 OpenAI API Key' })
    expect(toggle).not.toHaveAttribute('tabindex', '-1')
    fireEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })
})
