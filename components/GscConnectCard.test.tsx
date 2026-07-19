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
        locale="zh"
        gscConnected={false}
        gscSiteUrl={null}
        {...props}
      />
    </NextIntlClientProvider>,
  )
}

describe('GscConnectCard', () => {
  it('未连接：显示连接按钮，不显示已授权资源选择', () => {
    renderCard({ gscConnected: false })
    expect(screen.getByRole('button', { name: '连接 GSC' })).toBeInTheDocument()
    expect(screen.queryByText('确认使用此资源')).not.toBeInTheDocument()
  })

  it('已连接但无可访问资源：不提供手输 URL，也不显示无法提交的确认按钮', async () => {
    renderCard({ gscConnected: true })
    expect(screen.getByRole('button', { name: '重新连接 GSC' })).toBeInTheDocument()
    await screen.findByText(/没有可选择的 GSC 资源/)
    expect(screen.queryByRole('button', { name: '确认使用此资源' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('已有站点 URL 时，仅在授权资源列表中显示为已选择', async () => {
    mockSites(['sc-domain:a.com', 'https://a.com/'])
    renderCard({ gscConnected: true, gscSiteUrl: 'https://a.com/' })
    await waitFor(() => expect(screen.getByLabelText('选择已授权的 GSC 资源')).toBeInTheDocument())
    expect(screen.getByLabelText('选择已授权的 GSC 资源')).toHaveValue('https://a.com/')
    expect(screen.queryByRole('button', { name: '确认使用此资源' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('GSC 资源已保存。')
  })

  it('自动发现到站点时渲染下拉选择', async () => {
    mockSites(['sc-domain:a.com', 'https://a.com/'])
    renderCard({ gscConnected: true })
    await waitFor(() => expect(screen.getByLabelText('选择已授权的 GSC 资源')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'https://a.com/' })).toBeInTheDocument()
  })

  it('资源保存后收起确认按钮；改选新资源时才再次显示', async () => {
    mockSites(['https://a.com/', 'https://b.com/'])
    renderCard({ gscConnected: true })
    const select = await screen.findByLabelText('选择已授权的 GSC 资源')

    fireEvent.change(select, { target: { value: 'https://a.com/' } })
    fireEvent.click(screen.getByRole('button', { name: '确认使用此资源' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: '确认使用此资源' })).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('GSC 资源已保存。')

    fireEvent.change(select, { target: { value: 'https://b.com/' } })
    expect(screen.getByRole('button', { name: '确认使用此资源' })).toBeInTheDocument()
  })

  it('未连接时不请求站点发现', () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ sites: [] }) }))
    vi.stubGlobal('fetch', spy)
    renderCard({ gscConnected: false })
    expect(spy).not.toHaveBeenCalled()
  })

  it('gscAppConfigured=false：连接按钮禁用、显示平台未就绪提示、点击不跳转', () => {
    const original = window.location
    Object.defineProperty(window, 'location', { value: { ...original, href: 'about:blank' }, writable: true })
    renderCard({ gscConnected: false, gscAppConfigured: false })

    const button = screen.getByRole('button', { name: '连接 GSC' })
    expect(button).toBeDisabled()
    expect(
      screen.getByText('GSC 平台连接暂未就绪'),
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

  it('可指定 OAuth 往返设置页，授权后继续在设置页选择资源', () => {
    const original = window.location
    Object.defineProperty(window, 'location', { value: { ...original, href: 'about:blank' }, writable: true })
    renderCard({ connectionReturnTo: '/zh/settings?projectId=proj_a' })

    fireEvent.click(screen.getByRole('button', { name: '连接 GSC' }))
    expect(window.location.href).toContain(encodeURIComponent('/zh/settings?projectId=proj_a'))
    Object.defineProperty(window, 'location', { value: original, writable: true })
  })
})
