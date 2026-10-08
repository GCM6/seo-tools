import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreflightPanel, type PreflightPanelLabels } from './PreflightPanel'
import { buildPreflight, type PreflightProbe } from '@/lib/runs/preflight'
import zhMessages from '@/messages/zh.json'

const zh = zhMessages.preflight
// 与调用方（向导）同样的组装方式：字符串直接取文案，带参数的用函数格式化。
const labels: PreflightPanelLabels = {
  title: zh.title, loading: zh.loading, failed: zh.failed, allReady: zh.allReady,
  unavailableSummary: (dims) => zh.unavailableSummary.replace('{dims}', dims.join('、')),
  degradedSummary: (dims) => zh.degradedSummary.replace('{dims}', dims.join('、')),
  balance: (balance) => zh.balance.replace('{balance}', String(balance)),
  states: zh.state, sources: zh.source, reasons: zh.reason, fixes: zh.fix, dimensions: zh.dimension,
}

const allGood: PreflightProbe = {
  categoryValid: true, marketValid: true,
  gsc: { platformConfigured: true, connected: true, siteSelected: true, tokenOk: true },
  dataforseo: { hasCredentials: true, authOk: true, balance: 12.34 },
  psi: { hasKey: true }, render: { configured: true },
  ai: { engines: [{ provider: 'openai', webSearch: true }] },
}

describe('PreflightPanel（SP-A §4.5：向导第 2 步）', () => {
  it('有缺口时顶部分别列出"无法评估"与"评估受限"的维度，并显示原因与修复入口', () => {
    const items = buildPreflight({
      ...allGood,
      gsc: { ...allGood.gsc, tokenOk: false, tokenError: 'invalid_grant' },
      psi: { hasKey: false },
    })
    render(<PreflightPanel status="done" items={items} labels={labels} fixHref={(i) => (i.fix?.action === 'reauth_gsc' ? '/api/gsc/auth?projectId=proj_1' : null)} />)
    expect(screen.getByText('本次无法评估：排名、关键词')).toBeTruthy()
    expect(screen.getByText('本次评估受限：技术与性能')).toBeTruthy()
    expect(screen.getByText(zh.reason.gsc_token_invalid)).toBeTruthy()
    expect(screen.getByRole('link', { name: '重新授权' }).getAttribute('href')).toBe('/api/gsc/auth?projectId=proj_1')
    // fixHref 返回 null 的修复项不渲染链接
    expect(screen.queryByRole('link', { name: '去配置' })).toBeNull()
  })

  it('GSC 从没连接过：修复入口写「连接 GSC」；授权失效时才写「重新授权」', () => {
    const fixHref = (i: { fix: { action: string } | null }) => (i.fix?.action === 'reauth_gsc' ? '/api/gsc/auth?projectId=proj_1' : null)
    const neverConnected = buildPreflight({ ...allGood, gsc: { platformConfigured: true, connected: false, siteSelected: false, tokenOk: null } })
    const { unmount } = render(<PreflightPanel status="done" items={neverConnected} labels={{ ...labels, connectGsc: '连接 GSC' }} fixHref={fixHref} />)
    expect(screen.getByRole('link', { name: '连接 GSC' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '重新授权' })).toBeNull()
    unmount()

    const expired = buildPreflight({ ...allGood, gsc: { ...allGood.gsc, tokenOk: false, tokenError: 'invalid_grant' } })
    render(<PreflightPanel status="done" items={expired} labels={{ ...labels, connectGsc: '连接 GSC' }} fixHref={fixHref} />)
    expect(screen.getByRole('link', { name: '重新授权' })).toBeTruthy()
  })

  it('全部就绪：显示就绪说明，DataForSEO 带余额', () => {
    render(<PreflightPanel status="done" items={buildPreflight(allGood)} labels={labels} fixHref={() => null} />)
    expect(screen.getByText(zh.allReady)).toBeTruthy()
    expect(screen.getByText('账户余额：12.34 美元')).toBeTruthy()
    expect(screen.queryByText(/本次无法评估/)).toBeNull()
  })

  it('检查中 / 检查失败', () => {
    const { rerender } = render(<PreflightPanel status="loading" items={null} labels={labels} fixHref={() => null} />)
    expect(screen.getByText(zh.loading)).toBeTruthy()
    rerender(<PreflightPanel status="error" items={null} labels={labels} fixHref={() => null} />)
    expect(screen.getByRole('alert').textContent).toBe(zh.failed)
  })
})
