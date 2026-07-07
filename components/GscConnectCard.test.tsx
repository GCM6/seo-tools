import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { GscConnectCard } from './GscConnectCard'
import zhMessages from '@/messages/zh.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

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
})
