import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SiteHeaderView } from './SiteHeader'

// LocaleSwitch / DataSourceHealth 是 client leaf（next-intl + next/navigation hooks），
// 惯例参照 LocaleSwitch.test.tsx：mock 掉底层 hook，不测其内部行为。
vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/zh/projects',
  useRouter: () => ({ push: vi.fn() }),
}))

const labels = {
  projects: '项目',
  rules: '规则库',
  settings: '设置',
  newAnalysis: '新建分析',
  menuTitle: '菜单',
  themeMode: '主题模式',
}

const dataHealth = {
  up: 2,
  total: 5,
  items: [
    { key: 'gsc' as const, up: true },
    { key: 'googleCse' as const, up: false },
    { key: 'aiProbe' as const, up: true },
    { key: 'dataforseo' as const, up: false },
    { key: 'render' as const, up: false },
  ],
}

describe('SiteHeaderView', () => {
  it('renders the brand link and the four navigation entries', () => {
    render(<SiteHeaderView locale="zh" labels={labels} dataHealth={dataHealth} />)

    // next/link 规整掉尾部斜杠：/${locale}/ → /${locale}（渲染层面等价，不影响根页智能重定向）。
    expect(screen.getByRole('link', { name: /Veris/i })).toHaveAttribute('href', '/zh')
    expect(screen.getByRole('link', { name: '项目' })).toHaveAttribute('href', '/zh/projects')
    expect(screen.getByRole('link', { name: '规则库' })).toHaveAttribute('href', '/zh/rules')
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/zh/settings')
    expect(screen.getByRole('link', { name: '新建分析' })).toHaveAttribute('href', '/zh/new')
  })
})
