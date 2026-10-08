import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { KnowledgeBrainClient, latestRunsBySource } from './KnowledgeBrainClient'
import zhMessages from '@/messages/zh.json'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

const source = { id: 'ks_1', sourceType: 'reddit_community', name: 'r/TechSEO', canonicalUrl: 'https://www.reddit.com/r/TechSEO/', authorityLevel: 'community', enabled: true, lastSuccessAt: null }
const run = (id: string, status: string, startedAt: string, errorSummary: string | null = null) => ({
  id, sourceId: 'ks_1', status, fetchedCount: 3, changedCount: 1, errorCount: status === 'failed' ? 1 : 0, startedAt, coverage: {}, errorSummary,
})
const claim = (officialConflict: boolean) => ({
  claim: { id: 'kc_1', documentVersionId: 'dv_1', claimType: 'diagnostic_check', topic: 'crawl', statementZh: '检查 robots.txt 是否误封', statementEn: 'Check robots.txt', confidence: 'community_practice_candidate', officialConflict, createdAt: '2026-10-08T00:00:00Z' },
  sourceUrl: 'https://www.reddit.com/r/TechSEO/comments/1', exactQuote: 'robots blocked everything', sourceName: 'r/TechSEO', sourceType: 'reddit_community', documentTitle: 'Robots question', community: 'TechSEO',
})

function renderPage(props: Partial<Parameters<typeof KnowledgeBrainClient>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <KnowledgeBrainClient
        locale="zh"
        sources={[source]}
        runs={[]}
        claims={[]}
        entries={[]}
        proposals={[]}
        releases={{ knowledge: 'knowledge_v1', workflow: 'workflow_v1', ruleConfig: 'rulecfg_v1' }}
        {...props}
      />
    </NextIntlClientProvider>,
  )
}

describe('latestRunsBySource', () => {
  it('runs 按时间倒序时取每个来源的第一条（最新），不被旧记录覆盖', () => {
    const map = latestRunsBySource([run('new', 'completed', '2026-10-08T10:00:00Z'), run('old', 'failed', '2026-10-01T10:00:00Z')])
    expect(map.get('ks_1')?.id).toBe('new')
  })
})

describe('KnowledgeBrainClient（知识库）', () => {
  beforeEach(() => refreshMock.mockReset())

  it('页头 + 版本事实栏 + 带计数的视图标签', () => {
    renderPage({ claims: [claim(false)] })
    expect(screen.getByRole('heading', { level: 1, name: '知识库' })).toBeInTheDocument()
    expect(screen.getByText('knowledge_v1')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /来源/ })).toHaveTextContent('1')
    expect(screen.getByRole('tab', { name: /论点审核/ })).toHaveTextContent('1')
  })

  it('来源表：最近一次失败时写状态和可读的原因', () => {
    renderPage({ runs: [run('r1', 'failed', '2026-10-08T10:00:00Z', 'reddit_oauth_not_configured')] })
    const row = screen.getByRole('row', { name: /r\/TechSEO/ })
    expect(within(row).getByText('失败')).toBeInTheDocument()
    expect(within(row).getByText('还没配置 Reddit 授权，社区来源采集不了。')).toBeInTheDocument()
  })

  it('与官方冲突的论点：点「批准」先打开编辑区，不直接提交', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderPage({ claims: [claim(true)] })
    fireEvent.click(screen.getByRole('tab', { name: /论点审核/ }))
    expect(screen.getByText('与官方说法冲突，需要编辑后才能批准')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '批准' }))
    expect(screen.getByRole('form', { name: '编辑后批准' })).toBeInTheDocument()
    expect(screen.getByLabelText('中文知识表述')).toHaveValue('检查 robots.txt 是否误封')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('驳回必须写理由；提交后刷新', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    renderPage({ claims: [claim(false)] })
    fireEvent.click(screen.getByRole('tab', { name: /论点审核/ }))
    fireEvent.click(screen.getByRole('button', { name: '驳回' }))
    const form = screen.getByRole('form', { name: '驳回论点' })
    const submit = within(form).getByRole('button', { name: '驳回' })
    expect(submit).toBeDisabled()
    fireEvent.change(within(form).getByLabelText('审核理由'), { target: { value: '与官方文档矛盾' } })
    fireEvent.click(submit)
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    expect(body).toMatchObject({ action: 'reject', reason: '与官方文档矛盾' })
  })

  it('接口失败时用提示条说明，附错误码', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'no_approved_claims' }), { status: 422 })))
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /论点审核/ }))
    fireEvent.click(screen.getByRole('button', { name: '发布知识版本' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('操作没有成功（no_approved_claims），请重试。')
  })
})
