import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataSourceHealth } from './DataSourceHealth'
import type { HealthItem } from '@/lib/settings/data-source-health'

// 用 next-intl mock（照 RecCard.test 约定）：命名空间忽略，key→中文，支持 {up}/{total} 插值。
const DICT: Record<string, string> = {
  pill: '数据源 {up}/{total}',
  title: '数据源健康度',
  connect: '去连接',
  statusUp: '已就绪',
  statusDown: '未接入',
  'source.gsc': 'Google Search Console',
  'source.googleCse': 'Google 可见性检索',
  'source.aiProbe': 'AI 答案引擎探针',
  'source.dataforseo': 'DataForSEO',
  'source.render': '渲染抓取',
  'impact.gsc': 'GSC 影响',
  'impact.googleCse': 'CSE 影响',
  'impact.aiProbe': '探针影响',
  'impact.dataforseo': 'DataForSEO 影响',
  'impact.render': '渲染影响',
}
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    (DICT[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vals?.[k] ?? '')),
}))

const items: HealthItem[] = [
  { key: 'gsc', up: false },
  { key: 'googleCse', up: true },
  { key: 'aiProbe', up: false },
  { key: 'dataforseo', up: false },
  { key: 'render', up: true },
]

describe('DataSourceHealth', () => {
  it('pill 显示真实 up/total', () => {
    render(<DataSourceHealth items={items} up={2} total={5} locale="zh" />)
    expect(screen.getByText('数据源 2/5')).toBeInTheDocument()
  })

  it('抽屉默认收起，点击 pill 后展开列出各源', () => {
    render(<DataSourceHealth items={items} up={2} total={5} locale="zh" />)
    expect(screen.queryByText('AI 答案引擎探针')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /数据源 2\/5/ }))
    expect(screen.getByText('AI 答案引擎探针')).toBeInTheDocument()
    expect(screen.getByText('Google 可见性检索')).toBeInTheDocument()
  })

  it('仅 down 源显示「去连接」；CSE / DataForSEO 直接进入官方控制台', () => {
    render(<DataSourceHealth items={items} up={2} total={5} locale="zh" />)
    fireEvent.click(screen.getByRole('button', { name: /数据源 2\/5/ }))
    const links = screen.getAllByRole('link', { name: '去连接' })
    // 3 个 down 源（gsc / aiProbe / dataforseo）各一个
    expect(links).toHaveLength(3)
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/zh/settings#source-aiProbe')
    expect(hrefs).toContain('https://console.cloud.google.com/apis/credentials')
    expect(hrefs).not.toContain('/zh/settings#source-googleCse')
  })

  it('传 projectId 时 gsc「去连接」指向项目详情，DataForSEO 仍直达官方控制台', () => {
    render(<DataSourceHealth items={items} up={2} total={5} locale="zh" projectId="proj_a" />)
    fireEvent.click(screen.getByRole('button', { name: /数据源 2\/5/ }))
    const hrefs = screen.getAllByRole('link', { name: '去连接' }).map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/zh/projects/proj_a')
    expect(hrefs).toContain('https://app.dataforseo.com/api-access')
    // 全局源仍走设置页
    expect(hrefs).toContain('/zh/settings#source-aiProbe')
  })
})
