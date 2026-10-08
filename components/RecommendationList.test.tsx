import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import zhMessages from '@/messages/zh.json'
import { RecommendationList, type RecListItem } from './RecommendationList'

function resolveMessage(namespace: string | undefined, key: string, vars?: Record<string, unknown>): string {
  let node: unknown = zhMessages
  for (const p of [...(namespace ? namespace.split('.') : []), ...key.split('.')]) {
    if (typeof node !== 'object' || node === null) throw new Error(`missing message: ${namespace ?? ''}.${key}`)
    node = (node as Record<string, unknown>)[p]
  }
  if (typeof node !== 'string') throw new Error(`missing message: ${namespace ?? ''}.${key}`)
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`))
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, vars?: Record<string, unknown>) => resolveMessage(namespace, key, vars),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

function rec(overrides: Partial<RecListItem>): RecListItem {
  return { id: 'r', priority: 'fill_in', title: '建议', initialStatus: 'draft', fields: {}, ...overrides }
}

const items: RecListItem[] = [
  rec({ id: 'r_low', priority: 'low', title: '暂缓的建议', initialStatus: 'rejected' }),
  rec({ id: 'r_draft', priority: 'quick_win', title: '待确认的建议', initialStatus: 'draft', severity: 'high' }),
  rec({ id: 'r_acc', priority: 'quick_win', title: '已接受的建议', initialStatus: 'accepted', severity: 'mid' }),
]

function chip(name: RegExp) {
  return within(screen.getByRole('group', { name: '按状态筛选' })).getByRole('button', { name })
}

describe('RecommendationList', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)))
  })

  it('按优先级分组，组内严重度高的在前；筛选芯片带计数', () => {
    render(<RecommendationList items={items} checklistHref="/zh/runs/r/output" />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['优先处理2', '暂缓处理1'])
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['待确认的建议', '已接受的建议', '暂缓的建议'])
    expect(chip(/^全部/)).toHaveTextContent('全部3')
    expect(chip(/^待确认/)).toHaveTextContent('待确认1')
    expect(chip(/^已接受/)).toHaveTextContent('已接受1')
    expect(chip(/^已否决/)).toHaveTextContent('已否决1')
    expect(screen.getByText('共 3 条 · 待确认 1 · 已接受 1 · 已否决 1')).toBeInTheDocument()
  })

  it('在「待确认」里接受一条：该行留在原位显示新状态，计数实时更新；全部处理完后列表末尾给出执行清单入口', async () => {
    render(<RecommendationList items={items} checklistHref="/zh/runs/r/output" />)
    expect(screen.queryByRole('link', { name: '打开执行清单' })).not.toBeInTheDocument()

    fireEvent.click(chip(/^待确认/))
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['待确认的建议'])

    fireEvent.click(screen.getByRole('button', { name: '接受' }))
    await waitFor(() => expect(chip(/^待确认/)).toHaveTextContent('待确认0'))
    // 行没有立刻从眼前消失。
    expect(screen.getByRole('heading', { name: '待确认的建议' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: '建议决策摘要' })).getByRole('button', { name: '已接受' })).toHaveAttribute('aria-pressed', 'true')
    expect(chip(/^已接受/)).toHaveTextContent('已接受2')
    // 列表末尾出现完成提示和文字入口（不是第二个主按钮）。
    expect(screen.getByText('建议都已处理，已接受的 2 条在执行清单里。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开执行清单' })).toHaveAttribute('href', '/zh/runs/r/output')
    expect(screen.getByRole('link', { name: '打开执行清单' })).not.toHaveClass('ui-btn')

    // 再点一次筛选才重新过滤。
    fireEvent.click(chip(/^待确认/))
    expect(screen.getByText('这个筛选下没有建议。')).toBeInTheDocument()
  })
})
