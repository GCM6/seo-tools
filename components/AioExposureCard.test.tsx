import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { AioExposureCard } from './AioExposureCard'
import type { AioExposureSummary } from '@/lib/serp/aio-summary'
import zhMessages from '@/messages/zh.json'

function renderCard(props: { summary: AioExposureSummary | null; configured: boolean; settingsHref?: string }) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <AioExposureCard
        summary={props.summary}
        configured={props.configured}
        settingsHref={props.settingsHref ?? '/zh/settings#source-dataforseo'}
      />
    </NextIntlClientProvider>,
  )
}

const populatedSummary: AioExposureSummary = {
  totalQueries: 20,
  measuredQueries: 18,
  aioPresentCount: 6,
  ownedCitedCount: 2,
  citedDomains: [
    { domain: 'veris.example.com', count: 3, origin: 'owned' },
    { domain: 'wikipedia.org', count: 5, origin: 'third_party' },
  ],
  perQuery: [
    {
      query: '什么是 SEO 诊断工具',
      aioPresent: true,
      ownedCited: true,
      citedUrls: ['https://veris.example.com/features'],
    },
    {
      query: '如何做 GEO 优化',
      aioPresent: false,
      ownedCited: false,
      citedUrls: [],
    },
  ],
}

const zeroSummary: AioExposureSummary = {
  totalQueries: 20,
  measuredQueries: 20,
  aioPresentCount: 0,
  ownedCitedCount: 0,
  citedDomains: [],
  perQuery: [
    { query: '什么是 SEO 诊断工具', aioPresent: false, ownedCited: false, citedUrls: [] },
  ],
}

describe('AioExposureCard', () => {
  it('标题区亮出「实测曝光口径」字样', () => {
    renderCard({ summary: populatedSummary, configured: true })
    expect(screen.getByText('Google AI Overviews · 实测曝光口径')).toBeInTheDocument()
    expect(screen.getByText('实测')).toBeInTheDocument()
  })

  it('空态一：未配置 DataForSEO 时引导去设置页，不渲染任何数字', () => {
    renderCard({ summary: null, configured: false, settingsHref: '/zh/settings#source-dataforseo' })
    expect(screen.getByText('缺少 DataForSEO 数据源')).toBeInTheDocument()
    expect(screen.getByText('去设置页配置 →')).toHaveAttribute('href', '/zh/settings#source-dataforseo')
    expect(screen.queryByText('出现 AI Overview')).not.toBeInTheDocument()
  })

  it('空态二：已配置但本轮未采集', () => {
    renderCard({ summary: null, configured: true })
    expect(
      screen.getByText('DataForSEO 已配置，但本轮尚未采集 AI Overviews 曝光数据。重新诊断后这里会展示真实采样结果。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('缺少 DataForSEO 数据源')).not.toBeInTheDocument()
  })

  it('空态三：已采集但 0 条出现 AIO，如实展示 0，不当故障', () => {
    renderCard({ summary: zeroSummary, configured: true })
    // 数字区域正常渲染 0，而不是走 CTA/占位文案
    expect(screen.getByText('出现 AI Overview')).toBeInTheDocument()
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBe(2) // aioPresentCount=0, ownedCitedCount=0
    expect(screen.getByText('本轮 AI Overview 未引用任何域名')).toBeInTheDocument()
    expect(screen.queryByText('缺少 DataForSEO 数据源')).not.toBeInTheDocument()
  })

  it('正常态：头部三个数字取自 summary，不重新计算', () => {
    renderCard({ summary: populatedSummary, configured: true })
    expect(screen.getByText('6')).toBeInTheDocument() // aioPresentCount
    expect(screen.getByText('/ 18')).toBeInTheDocument() // measuredQueries 分母
    expect(screen.getByText('2')).toBeInTheDocument() // ownedCitedCount
    expect(screen.getByText('/ 6')).toBeInTheDocument() // aioPresentCount 分母（owned 一栏）
    expect(screen.getByText('18')).toBeInTheDocument() // measuredQueries 主数字
    expect(screen.getByText('/ 20')).toBeInTheDocument() // totalQueries 分母
  })

  it('单次采样波动提示：不展示置信区间', () => {
    renderCard({ summary: populatedSummary, configured: true })
    expect(
      screen.getByText('单次采样（n=1），实际曝光存在日间波动——不展示置信区间，样本量不支持估计，回测需连续多轮观察趋势'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/置信下限/)).not.toBeInTheDocument()
  })

  it('owned 域名高亮，third_party 不带自有徽标', () => {
    renderCard({ summary: populatedSummary, configured: true })
    const ownedRow = screen.getByText('veris.example.com').closest('li')
    const thirdPartyRow = screen.getByText('wikipedia.org').closest('li')
    expect(ownedRow).toHaveClass('owned')
    expect(thirdPartyRow).not.toHaveClass('owned')
    // 自有域名徽标只出现一次，挂在 owned 行内
    expect(ownedRow).toHaveTextContent('自有域名')
    expect(thirdPartyRow).not.toHaveTextContent('自有域名')
  })

  it('perQuery 行可展开显示原始引用链接，供逐条核对证据', () => {
    renderCard({ summary: populatedSummary, configured: true })
    const link = screen.getByRole('link', { name: 'https://veris.example.com/features' })
    expect(link).toHaveAttribute('href', 'https://veris.example.com/features')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('未命中 AIO 的查询展示未出现状态与无引用链接提示', () => {
    renderCard({ summary: populatedSummary, configured: true })
    expect(screen.getByText('未出现 AIO')).toBeInTheDocument()
    expect(screen.getByText('该查询未采集到引用链接')).toBeInTheDocument()
  })
})
