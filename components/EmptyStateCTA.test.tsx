import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EmptyStateCTA } from './EmptyStateCTA'

// EmptyStateCTA 是 i18n-free 纯展示：调用方 t() 后传入已翻译字符串，
// 可直接用于 Server Component（无 hook）。
describe('EmptyStateCTA', () => {
  it('渲染标题、影响说明与主按钮文案', () => {
    render(
      <EmptyStateCTA
        title="缺少 AI 探针数据源"
        impact="答案地图需要 AI 答案引擎探针"
        actionLabel="去连接"
        href="/zh/settings#source-aiProbe"
      />,
    )
    expect(screen.getByText('缺少 AI 探针数据源')).toBeInTheDocument()
    expect(screen.getByText('答案地图需要 AI 答案引擎探针')).toBeInTheDocument()
  })

  it('主按钮链接指向传入的 href', () => {
    render(
      <EmptyStateCTA
        title="缺少 AI 探针数据源"
        impact="影响一句话"
        actionLabel="去连接"
        href="/zh/settings#source-aiProbe"
      />,
    )
    const link = screen.getByRole('link', { name: '去连接' })
    expect(link).toHaveAttribute('href', '/zh/settings#source-aiProbe')
  })
})
