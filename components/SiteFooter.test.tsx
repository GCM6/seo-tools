import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SiteFooterView } from './SiteFooter'

const labels = {
  productTagline: 'SEO + GEO 证据化诊断工作台',
  productMethodology: '每个结论都有证据分级，『实测』标签仅授予 L3/L4 证据。',
  navTitle: '导航',
  methodologyTitle: '方法论',
  evidenceLevels: '证据分级 L0–L4：从无证据支撑到硬证据实测。',
  sameProtocol: '同协议回测：前后对比使用同一 prompt 集、市场语言、模型族与采样规则。',
  rulesVersionLabel: '规则版本',
  protocolVersionLabel: '协议版本',
  projects: '项目',
  newAnalysis: '新建分析',
  rules: '规则库',
  settings: '设置',
}

function renderFooter() {
  return render(
    <SiteFooterView
      locale="zh"
      labels={labels}
      rulesVersion="rules_v1"
      protocolVersion="v2"
      appVersion="0.1.0"
    />,
  )
}

describe('SiteFooterView', () => {
  it('renders the three columns', () => {
    renderFooter()
    expect(screen.getByText(labels.productMethodology)).toBeInTheDocument()
    expect(screen.getByText(labels.navTitle)).toBeInTheDocument()
    expect(screen.getByText(labels.methodologyTitle)).toBeInTheDocument()
    expect(screen.getByText(labels.evidenceLevels)).toBeInTheDocument()
    expect(screen.getByText(labels.sameProtocol)).toBeInTheDocument()
  })

  it('renders the footer nav links pointing at existing routes', () => {
    renderFooter()
    expect(screen.getByRole('link', { name: labels.projects })).toHaveAttribute('href', '/zh/projects')
    expect(screen.getByRole('link', { name: labels.newAnalysis })).toHaveAttribute('href', '/zh/new')
    expect(screen.getByRole('link', { name: labels.rules })).toHaveAttribute('href', '/zh/rules')
    expect(screen.getByRole('link', { name: labels.settings })).toHaveAttribute('href', '/zh/settings')
  })

  it('shows the rules version and app version', () => {
    renderFooter()
    expect(screen.getByText(/rules_v1/)).toBeInTheDocument()
    expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument()
  })
})
