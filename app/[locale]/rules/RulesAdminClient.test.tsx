import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { RulesAdminClient } from './RulesAdminClient'
import zhMessages from '@/messages/zh.json'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

const proposal = {
  id: 'rcp_1',
  source: 'manual',
  changeType: 'update_artifact',
  target: 'refart_gsc_docs',
  evidenceRefs: ['https://www.developers.google.com/search/docs/crawling-indexing'],
  createdAt: '2026-10-08T03:00:00.000Z',
}

function renderPage(props: Partial<Parameters<typeof RulesAdminClient>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <RulesAdminClient locale="zh" pending={[]} approvedCount={0} changelog={[]} {...props} />
    </NextIntlClientProvider>,
  )
}

describe('RulesAdminClient（规则库：待审提案 / 手动建提案 / 版本记录）', () => {
  beforeEach(() => refreshMock.mockReset())

  it('没有待审提案：标签带计数 0，面板写空状态', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '规则库管理' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /待审提案/ })).toHaveTextContent('0')
    expect(screen.getByText('暂无待审提案')).toBeInTheDocument()
    expect(screen.getByText('所有提案都处理完了，诊断按当前规则版本运行。')).toBeInTheDocument()
  })

  it('待审提案一行一条：类型、目标、来源、证据链接（完整地址在 title 里），批准是主按钮', () => {
    renderPage({ pending: [proposal] })
    const row = screen.getByRole('row', { name: /refart_gsc_docs/ })
    expect(within(row).getByText('更新资产')).toBeInTheDocument()
    expect(within(row).getByText('手动')).toBeInTheDocument()
    const link = within(row).getByRole('link', { name: 'developers.google.com/search/docs/crawling-indexing' })
    expect(link).toHaveAttribute('title', proposal.evidenceRefs[0])
    expect(within(row).getByRole('button', { name: '批准' })).toHaveClass('ui-btn--primary')
    expect(within(row).getByRole('button', { name: '驳回' })).not.toHaveClass('ui-btn--primary')
  })

  it('批准失败时提示，不静默刷新', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'proposal_not_found' }), { status: 404 })))
    renderPage({ pending: [proposal] })
    fireEvent.click(screen.getByRole('button', { name: '批准' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('操作没有成功，请重试。')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('批准成功：PATCH 带动作，然后刷新列表', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    renderPage({ pending: [proposal] })
    fireEvent.click(screen.getByRole('button', { name: '批准' }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/rules/proposals/rcp_1')
    expect(JSON.parse(init?.body as string)).toEqual({ action: 'approve' })
  })

  it('有已批准未发版的提案：提示条里说明数量并给「打包发版」，成功后写出版本号', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: 'rules_v11', released: 2, artifactsUpdated: 1 }), { status: 200 })))
    renderPage({ approvedCount: 2 })
    expect(screen.getByText('有 2 条提案已批准、尚未发版。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打包发版' }))
    expect(await screen.findByText(/已发版 rules_v11：2 条提案，1 个资产更新/)).toBeInTheDocument()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('手动建提案：服务端说目标为空时给对应提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'target_required' }), { status: 422 })))
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '手动建提案' }))
    fireEvent.change(screen.getByLabelText('目标（规则 ID 或资产 key）'), { target: { value: 'rule_x' } })
    fireEvent.change(screen.getByLabelText('一手来源 URL（每行一个，至少一个）'), { target: { value: 'https://example.com/a\n\nhttps://example.com/b' } })
    fireEvent.click(screen.getByRole('button', { name: '提交提案' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('目标不能为空')
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    expect(body).toEqual({ changeType: 'update_artifact', target: 'rule_x', evidenceRefs: ['https://example.com/a', 'https://example.com/b'] })
  })

  it('版本记录：每个版本一个小节，写变更条数', () => {
    renderPage({
      changelog: [{ version: 'rules_v10', proposals: [{ changeType: 'new_rule', target: 'rule_a', evidenceRefs: [], reviewedAt: null }] }],
    })
    fireEvent.click(screen.getByRole('tab', { name: /版本变更记录/ }))
    const section = screen.getByRole('region', { name: /rules_v10/ })
    expect(within(section).getByText('1 条变更')).toBeInTheDocument()
    expect(within(section).getByText('新增规则')).toBeInTheDocument()
  })
})
