import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { NewAnalysisForm } from './NewAnalysisForm'
import zhMessages from '@/messages/zh.json'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

function renderForm(props: Partial<Parameters<typeof NewAnalysisForm>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <NewAnalysisForm locale="zh" {...props} />
    </NextIntlClientProvider>,
  )
}

// 走完第 1 步：填域名 + 点「下一步」，等第 2 步出现。
async function advanceToConnect() {
  fireEvent.change(screen.getByLabelText('网址'), { target: { value: 'https://example.com' } })
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await screen.findByRole('heading', { name: '连接数据' })
}

describe('NewAnalysisForm 向导可见性', () => {
  it('渲染 section.screen.show（否则整屏被 display:none 隐藏）', () => {
    const { container } = renderForm()
    expect(container.querySelector('section.screen')).toHaveClass('show')
  })

  it('默认从第 1 步开始，显示步骤指示', () => {
    renderForm()
    expect(screen.getByLabelText('网址')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '你的网站' })).toBeInTheDocument()
  })

  it('未接入 GSC 时，在创建项目之前先说明其能补齐的实测数据', () => {
    renderForm()
    expect(screen.getByText('建议连接 GSC，补齐实测搜索数据')).toBeInTheDocument()
    expect(screen.getByText(/点击、曝光、CTR 和平均排名/)).toBeInTheDocument()
    expect(screen.getByText('项目级')).toBeInTheDocument()
  })
})

describe('NewAnalysisForm 第 1 步智能预填', () => {
  it('输入 .cn 域名自动预选「中文·中国大陆」市场', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('网址'), { target: { value: 'brand.cn' } })
    expect((screen.getByLabelText('市场 / 语言') as HTMLSelectElement).value).toBe('中文 · 中国大陆')
  })

  it('输入 .com 域名预选「English · Global」', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('网址'), { target: { value: 'brand.com' } })
    expect((screen.getByLabelText('市场 / 语言') as HTMLSelectElement).value).toBe('English · Global')
  })
})

describe('NewAnalysisForm 第 2 步引擎多选预填（savedEngines 回填，spec §2.4）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'proj_x' }), { status: 201 })))
  })

  it('传 savedEngines 仅含一个引擎 key 时，仅该 chip 选中', async () => {
    renderForm({ savedEngines: ['Perplexity'] })
    await advanceToConnect()
    expect(screen.getByRole('checkbox', { name: 'ChatGPT' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Perplexity' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Gemini' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'DeepSeek' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Google AI Overviews' })).not.toBeChecked()
  })

  it('不传 savedEngines 时维持默认（4 开 1 关）', async () => {
    renderForm()
    await advanceToConnect()
    expect(screen.getByRole('checkbox', { name: 'ChatGPT' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Perplexity' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Gemini' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'DeepSeek' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Google AI Overviews' })).not.toBeChecked()
  })
})

describe('NewAnalysisForm Google AI Overviews chip（DataForSEO 实测曝光口径）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'proj_x' }), { status: 201 })))
  })

  it('DataForSEO 未配置：chip 禁用，展示"需先配置"提示', async () => {
    renderForm({ dataforseoConfigured: false })
    await advanceToConnect()
    const checkbox = screen.getByRole('checkbox', { name: 'Google AI Overviews' })
    expect(checkbox).toBeDisabled()
    expect(screen.getByText(/需先在设置页配置 DataForSEO/)).toBeInTheDocument()
  })

  it('DataForSEO 已配置：chip 可勾选，无禁用提示', async () => {
    renderForm({ dataforseoConfigured: true })
    await advanceToConnect()
    const checkbox = screen.getByRole('checkbox', { name: 'Google AI Overviews' })
    expect(checkbox).not.toBeDisabled()
    expect(screen.queryByText(/需先在设置页配置 DataForSEO/)).not.toBeInTheDocument()

    // 已配置后仍可正常勾选/取消
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })
})

describe('NewAnalysisForm 第 2 步数据连接三态', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'proj_x' }), { status: 201 })))
  })

  it('AI 探针未配显示「去配置」直达设置页锚点', async () => {
    renderForm({ aiProbeConfigured: false })
    await advanceToConnect()
    const link = screen.getByRole('link', { name: '去配置' })
    expect(link).toHaveAttribute('href', '/zh/settings#source-aiProbe')
  })

  it('AI 探针已配显示「已配置 ✓」，无去配置链接', async () => {
    renderForm({ aiProbeConfigured: true })
    await advanceToConnect()
    expect(screen.getByText('已配置 ✓')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '去配置' })).not.toBeInTheDocument()
  })

  it('GSC 已授权且已选择资源时显示「已连接 ✓」而非连接按钮', async () => {
    renderForm({ gscConnected: true, gscSiteUrl: 'sc-domain:example.com' })
    fireEvent.change(screen.getByLabelText('网址'), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    await screen.findByText('已连接 ✓')
    expect(screen.queryByRole('button', { name: '连接 GSC' })).not.toBeInTheDocument()
  })

  it('GSC 已授权但尚未选择资源时，引导回当前项目详情页完成选择', async () => {
    renderForm({
      project: { id: 'proj_x', domain: 'https://example.com', industry: '', market: '', language: '', competitors: [] },
      gscConnected: true,
      gscSiteUrl: null,
      initialStep: 2,
    })
    expect(screen.getByText(/还需在项目详情页选择一个已授权 GSC 资源/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '选择 GSC 资源' })).toHaveAttribute('href', '/zh/projects/proj_x#gsc')
    expect(screen.queryByText('已连接 ✓')).not.toBeInTheDocument()
  })

  it('输入已存在域名时，同步该项目的 GSC 资源与默认探针配置', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        id: 'proj_existing',
        domain: 'https://example.com/',
        industry: '跨境电商',
        market: 'English · Global',
        competitors: ['competitor.example'],
        reused: true,
        settings: {
          gscConnected: true,
          gscSiteUrl: 'sc-domain:example.com',
          defaultModels: ['Perplexity'],
        },
      }), { status: 200 })),
    )
    renderForm()
    await advanceToConnect()

    await screen.findByText('已连接 ✓')
    expect(screen.getByRole('checkbox', { name: 'ChatGPT' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Perplexity' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Gemini' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'DeepSeek' })).not.toBeChecked()
    expect(screen.queryByRole('button', { name: '连接 GSC' })).not.toBeInTheDocument()
  })

  it('gscAppConfigured=false：连接按钮禁用、显示平台未就绪提示、点击不跳转', async () => {
    const original = window.location
    Object.defineProperty(window, 'location', { value: { ...original, href: 'about:blank' }, writable: true })
    renderForm({ gscAppConfigured: false })
    await advanceToConnect()

    const button = screen.getByRole('button', { name: '连接 GSC' })
    expect(button).toBeDisabled()
    expect(
      screen.getByText(/平台连接服务暂未就绪/),
    ).toBeInTheDocument()

    fireEvent.click(button)
    expect(window.location.href).toBe('about:blank')
    Object.defineProperty(window, 'location', { value: original, writable: true })
  })

  it('gscAppConfigured=true（默认）：行为不变，点击连接仍跳转到 /api/gsc/auth', async () => {
    const original = window.location
    Object.defineProperty(window, 'location', { value: { ...original, href: 'about:blank' }, writable: true })
    renderForm()
    await advanceToConnect()

    const button = screen.getByRole('button', { name: '连接 GSC' })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(window.location.href).toContain('/api/gsc/auth?projectId=proj_x')
    Object.defineProperty(window, 'location', { value: original, writable: true })
  })
})

describe('NewAnalysisForm 第 3 步预估与提交', () => {
  beforeEach(() => {
    pushMock.mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/projects') return new Response(JSON.stringify({ id: 'proj_x' }), { status: 201 })
        if (url.startsWith('/api/projects/')) return new Response(JSON.stringify({ id: 'proj_x' }), { status: 200 })
        if (url === '/api/runs') return new Response(JSON.stringify({ id: 'run_y' }), { status: 201 })
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )
  })

  async function advanceToConfirm() {
    await advanceToConnect()
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    await screen.findByText(/预估（非实测）/)
  }

  it('第 3 步显示探针调用预估并标注为预估', async () => {
    renderForm()
    await advanceToConfirm()
    // 默认 4 引擎 × 20 × 5 = 400 次
    expect(screen.getByText('约 400 次')).toBeInTheDocument()
    expect(screen.getByText('预估（非实测）')).toBeInTheDocument()
  })

  it('先 upsert 项目再建 run，最后跳转到新 run', async () => {
    renderForm()
    await advanceToConfirm()
    fireEvent.click(screen.getByRole('button', { name: /开始诊断/ }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/zh/runs/run_y'))
    const calls = vi.mocked(fetch).mock.calls.map((c) => [c[0], (c[1] as RequestInit)?.method])
    expect(calls[0]).toEqual(['/api/projects', 'POST']) // 第 1 步创建
    expect(calls.some(([u, m]) => String(u).startsWith('/api/projects/') && m === 'PATCH')).toBe(true) // 引擎回填
    const runCall = vi.mocked(fetch).mock.calls.find((c) => c[0] === '/api/runs')!
    expect(JSON.parse(runCall[1]?.body as string)).toMatchObject({ projectId: 'proj_x', runType: 'baseline' })
  })

  it('建 run 失败（503 dispatch_failed）显示可行动错误，不跳转', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/projects') return new Response(JSON.stringify({ id: 'proj_x' }), { status: 201 })
        if (url.startsWith('/api/projects/')) return new Response(JSON.stringify({ id: 'proj_x' }), { status: 200 })
        return new Response(JSON.stringify({ error: 'dispatch_failed' }), { status: 503 })
      }),
    )
    renderForm()
    await advanceToConfirm()
    fireEvent.click(screen.getByRole('button', { name: /开始诊断/ }))
    await waitFor(() =>
      expect(
        screen.getByText('采集任务派发失败：后台任务服务（Inngest）不可用，请启动后重试。'),
      ).toBeInTheDocument(),
    )
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('第 1 步域名非法（422 invalid_domain）显示域名专属错误，不进第 2 步', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_domain' }), { status: 422 })),
    )
    renderForm()
    fireEvent.change(screen.getByLabelText('网址'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    await waitFor(() => expect(screen.getByText('站点地址无效，请检查后重试。')).toBeInTheDocument())
    expect(screen.queryByText('连接 GSC')).not.toBeInTheDocument()
  })
})
