import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProjectList, type ProjectSummaryItem } from './ProjectList'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const labels = {
  newAnalysis: '新建分析',
  colDomain: '域名',
  colMarket: '市场',
  colLatest: '最近诊断',
  colFindings: '发现数',
  colGsc: 'GSC',
  colRetest: '下次回测',
  colAction: '操作',
  empty: '还没有项目',
  emptyHint: '输入一个网址，先跑一次诊断。',
  noRun: '尚未诊断',
  retestNone: '—',
  findingsUnit: '{count} 条',
  actionRunning: '诊断中…',
  actionRetest: '发起回测',
  actionReconfigure: '重新配置',
  actionConfigure: '配置并分析',
  retestStarting: '发起中…',
  retestError: '发起失败',
  retestInProgress: '已有诊断进行中，查看',
  searchLabel: '搜索项目',
  searchPlaceholder: '输入域名进行搜索…',
  searchEmpty: '没有找到包含“{query}”的项目',
  clearSearch: '清除搜索',
  gscConnected: 'GSC 已接入',
  gscPending: '待接入 GSC',
}
const statusLabels = { output: '已完成', diagnosing: '诊断中' }
const runTypeLabels = { baseline: '基线', retest: '回测' }

const projects: ProjectSummaryItem[] = [
  {
    id: 'proj_a',
    domain: 'a.com',
    market: 'US',
    gscReady: true,
    nextRetestDueAt: '2026-08-01',
    latestRun: { id: 'run_a', runType: 'baseline', status: 'output', startedAt: '2026-07-01', findingCount: 12 },
    activeRun: null,
    retestAnchor: { id: 'run_a' },
  },
  {
    id: 'proj_b',
    domain: 'b.com',
    market: 'CN',
    gscReady: false,
    nextRetestDueAt: null,
    latestRun: null,
    activeRun: null,
    retestAnchor: null,
  },
]

function renderList(items = projects, variant: 'full' | 'compact' = 'full') {
  return render(
    <ProjectList
      locale="zh"
      projects={items}
      labels={labels}
      statusLabels={statusLabels}
      runTypeLabels={runTypeLabels}
      variant={variant}
    />,
  )
}

describe('ProjectList', () => {
  it('区分渲染多个项目的域名', () => {
    renderList()
    expect(screen.getByText('a.com')).toBeInTheDocument()
    expect(screen.getByText('b.com')).toBeInTheDocument()
  })

  it('行链接指向 /<locale>/projects/<id>', () => {
    renderList()
    expect(screen.getByRole('link', { name: 'a.com' })).toHaveAttribute('href', '/zh/projects/proj_a')
  })

  it('每个项目单独展示自己的 GSC 接入状态', () => {
    renderList()
    expect(screen.getByText('GSC 已接入')).toBeInTheDocument()
    expect(screen.getByText('待接入 GSC')).toBeInTheDocument()
  })

  it('有最近 run 显示类型·状态与发现数；无 run 显示未诊断', () => {
    renderList()
    expect(screen.getByText('基线 · 已完成')).toBeInTheDocument()
    expect(screen.getByText('12 条')).toBeInTheDocument()
    expect(screen.getByText('尚未诊断')).toBeInTheDocument()
  })

  it('新建分析按钮指向 /<locale>/new', () => {
    renderList()
    expect(screen.getByRole('link', { name: '新建分析' })).toHaveAttribute('href', '/zh/new')
  })

  it('空列表显示空态', () => {
    renderList([])
    expect(screen.getByText('还没有项目')).toBeInTheDocument()
  })

  describe('操作列三态（spec §2.1）', () => {
    it('running：存在 activeRun 时显示「诊断中…」并链到该 run', () => {
      renderList([
        {
          id: 'proj_running',
          domain: 'running.com',
          market: 'US',
          gscReady: false,
          nextRetestDueAt: null,
          latestRun: null,
          activeRun: { id: 'run_active', status: 'diagnosing' },
          retestAnchor: null,
        },
      ])
      const link = screen.getByRole('link', { name: '诊断中…' })
      expect(link).toHaveAttribute('href', '/zh/runs/run_active')
      expect(screen.queryByRole('button', { name: '发起回测' })).not.toBeInTheDocument()
    })

    it('retestable：无 activeRun 且有 retestAnchor 时显示「发起回测」按钮 +「重新配置」链接', () => {
      renderList([
        {
          id: 'proj_retestable',
          domain: 'retestable.com',
          market: 'US',
          gscReady: false,
          nextRetestDueAt: null,
          latestRun: null,
          activeRun: null,
          retestAnchor: { id: 'run_baseline' },
        },
      ])
      expect(screen.getByRole('button', { name: '发起回测' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '重新配置' })).toHaveAttribute(
        'href',
        '/zh/new?projectId=proj_retestable',
      )
    })

    it('unconfigured：既无 activeRun 也无 retestAnchor 时显示「配置并分析」', () => {
      renderList([
        {
          id: 'proj_unconfigured',
          domain: 'unconfigured.com',
          market: 'US',
          gscReady: false,
          nextRetestDueAt: null,
          latestRun: null,
          activeRun: null,
          retestAnchor: null,
        },
      ])
      expect(screen.getByRole('link', { name: '配置并分析' })).toHaveAttribute(
        'href',
        '/zh/new?projectId=proj_unconfigured',
      )
    })
  })
})

describe('ProjectList 搜索与首页精简版（ux-blueprint §2.1 / §1）', () => {
  it('按域名搜索；搜不到时说明搜了什么，并可一键清除', () => {
    renderList()
    const search = screen.getByRole('searchbox', { name: '搜索项目' })
    fireEvent.change(search, { target: { value: 'b.c' } })
    expect(screen.queryByText('a.com')).not.toBeInTheDocument()
    expect(screen.getByText('b.com')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText('没有找到包含“zzz”的项目')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    expect(screen.getByText('a.com')).toBeInTheDocument()
    expect(screen.getByText('b.com')).toBeInTheDocument()
  })

  it('首页精简版：没有搜索框和操作列，只列前 10 个项目', () => {
    const many: ProjectSummaryItem[] = Array.from({ length: 12 }, (_, i) => ({
      ...projects[1],
      id: `p${i}`,
      domain: `site${i}.com`,
    }))
    renderList(many, 'compact')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '配置并分析' })).not.toBeInTheDocument()
    const body = screen.getAllByRole('rowgroup')[1]
    expect(within(body).getAllByRole('row')).toHaveLength(10)
  })

  it('空列表：空状态带「新建分析」入口', () => {
    renderList([])
    expect(screen.getByText('输入一个网址，先跑一次诊断。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '新建分析' })).toHaveAttribute('href', '/zh/new')
  })
})

