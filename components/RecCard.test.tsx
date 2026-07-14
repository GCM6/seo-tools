import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecCard } from './RecCard'

// RecCard is a client leaf that pulls copy via next-intl's useTranslations.
// Mock it (mirrors LocaleSwitch.test) so the component renders without an
// NextIntlClientProvider and the action labels are deterministic.
const DICT: Record<string, string> = {
  'common.actions.accept': '接受',
  'common.actions.accepted': '已接受',
  'common.actions.edit': '编辑',
  'common.actions.editing': '编辑中',
  'common.actions.reject': '否决',
  'common.actions.collapse': '收起',
  'screen3.priority.fill_in': '顺手补齐',
  'screen3.status.draft': '待你确认',
  'screen3.details': '查看证据、风险与验证',
  'screen3.noRationale': '暂无补充说明',
  'screen3.label.why': '为什么',
  'screen3.label.evidence': '证据',
  'screen3.label.impact': '预期影响',
  'screen3.label.confidence': '置信度',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => DICT[key] ?? key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

describe('RecCard accept/reject', () => {
  beforeEach(() => {
    // Stub global fetch so click handlers never hit the network.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response),
      ),
    )
  })

  it('accept and reject are mutually exclusive', async () => {
    render(
      <RecCard
        id="r1"
        priority="P1"
        title="t"
        fields={{ why: '', evidence: '', impact: '', confidence: '' }}
        initialStatus="draft"
      />,
    )

    // Accept → the "accepted" affordance appears.
    fireEvent.click(screen.getByRole('button', { name: /接受|accept/i }))
    expect(
      await screen.findByRole('button', { name: /已接受|accepted/i }),
    ).toBeInTheDocument()

    // Reject clears the accepted state → mutually exclusive.
    fireEvent.click(screen.getByRole('button', { name: /否决|reject/i }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /已接受|accepted/i }),
      ).not.toBeInTheDocument(),
    )
  })

  it('PATCHes /api/recommendations/{id} with the new status on accept', async () => {
    render(<RecCard id="r2" priority="P1" title="t" fields={{}} initialStatus="draft" />)

    fireEvent.click(screen.getByRole('button', { name: /接受|accept/i }))
    await waitFor(() => expect(fetch).toHaveBeenCalled())

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    const [url, init] = call as [string, RequestInit]
    expect(url).toBe('/api/recommendations/r2')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ status: 'accepted' })
  })

  it('keeps a static fix snippet out of the decision headline and behind a disclosure', () => {
    render(
      <RecCard
        id="r3"
        priority="quick_win"
        title={'移除重点页 noindex\n\n参考修复示例（静态模板，非生成内容）：\n<meta name="robots" content="index,follow" />'}
        fields={{ why: '重点页被排除在索引之外。' }}
        initialStatus="draft"
      />,
    )

    expect(screen.getByRole('heading', { name: '移除重点页 noindex' })).toBeInTheDocument()
    const disclosure = screen.getByText('查看证据、风险与验证').closest('details')
    expect(disclosure).not.toHaveAttribute('open')
  })
})
