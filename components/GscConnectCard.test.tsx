import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { GscConnectCard } from './GscConnectCard'
import zhMessages from '@/messages/zh.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

// 已连接时组件挂载会 fetch /api/gsc/sites——默认 mock 返回空站点；单测按需覆盖。
function mockSites(sites: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ sites }) })),
  )
}

beforeEach(() => mockSites([]))
afterEach(() => vi.unstubAllGlobals())

function renderCard(props: Partial<Parameters<typeof GscConnectCard>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <GscConnectCard
        projectId="proj_a"
        projectDomain="a.com"
        locale="zh"
        gscConnected={false}
        gscSiteUrl={null}
        {...props}
      />
    </NextIntlClientProvider>,
  )
}

describe('GscConnectCard', () => {
  it('未连接：显示连接按钮，不显示站点表单', () => {
    renderCard({ gscConnected: false })
    expect(screen.getByRole('button', { name: '连接 GSC' })).toBeInTheDocument()
    expect(screen.queryByText('保存站点 URL')).not.toBeInTheDocument()
  })

  it('已连接：显示重连 + 站点 URL 表单（预填 sc-domain:域名）', () => {
    renderCard({ gscConnected: true })
    expect(screen.getByRole('button', { name: '重新连接 GSC' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存站点 URL' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('sc-domain:a.com')).toBeInTheDocument()
  })

  it('已有站点 URL 时预填该值', () => {
    renderCard({ gscConnected: true, gscSiteUrl: 'https://a.com/' })
    expect(screen.getByDisplayValue('https://a.com/')).toBeInTheDocument()
  })

  it('自动发现到站点时渲染下拉选择', async () => {
    mockSites(['sc-domain:a.com', 'https://a.com/'])
    renderCard({ gscConnected: true })
    await waitFor(() => expect(screen.getByLabelText('从已授权站点选择')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'https://a.com/' })).toBeInTheDocument()
  })

  it('未连接时不请求站点发现', () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ sites: [] }) }))
    vi.stubGlobal('fetch', spy)
    renderCard({ gscConnected: false })
    expect(spy).not.toHaveBeenCalled()
  })

  it('gscAppConfigured=false：连接按钮禁用、显示环境变量提示、点击不跳转', () => {
    const original = window.location
    Object.defineProperty(window, 'location', { value: { ...original, href: 'about:blank' }, writable: true })
    renderCard({ gscConnected: false, gscAppConfigured: false })

    const button = screen.getByRole('button', { name: '连接 GSC' })
    expect(button).toBeDisabled()
    expect(
      screen.getByText(/未配置 Google OAuth.*GOOGLE_OAUTH_CLIENT_ID.*GOOGLE_OAUTH_CLIENT_SECRET.*GOOGLE_OAUTH_REDIRECT_URI/),
    ).toBeInTheDocument()

    fireEvent.click(button)
    expect(window.location.href).toBe('about:blank')
    Object.defineProperty(window, 'location', { value: original, writable: true })
  })

  it('gscAppConfigured=true（默认）：行为不变，点击连接跳转到 /api/gsc/auth', () => {
    const original = window.location
    Object.defineProperty(window, 'location', { value: { ...original, href: 'about:blank' }, writable: true })
    renderCard({ gscConnected: false })

    const button = screen.getByRole('button', { name: '连接 GSC' })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(window.location.href).toContain('/api/gsc/auth?projectId=proj_a')
    Object.defineProperty(window, 'location', { value: original, writable: true })
  })
})
