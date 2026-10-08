import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SiteFooterView } from './SiteFooter'

function renderFooter() {
  return render(
    <SiteFooterView
      labels={{ rulesVersionLabel: '规则版本', protocolVersionLabel: '协议版本' }}
      rulesVersion="rules_v1"
      protocolVersion="v2"
      appVersion="0.1.0"
    />,
  )
}

// 应用内页脚只保留一行版本信息（ux-blueprint §0）：版本号服务诊断可复现。
describe('SiteFooterView', () => {
  it('一行显示应用版本、规则版本与协议版本', () => {
    renderFooter()
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent('Veris · v0.1.0 · 规则版本 rules_v1 · 协议版本 v2')
  })

  it('不再渲染营销式多栏页脚的导航链接', () => {
    renderFooter()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
