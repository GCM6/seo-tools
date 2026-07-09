import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProjectList, type ProjectSummaryItem } from './ProjectList'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const labels = {
  newAnalysis: '新建分析',
  colDomain: '域名',
  colLatest: '最近诊断',
  colFindings: '发现数',
  colRetest: '下次回测',
  colAction: '操作',
  empty: '还没有项目',
  noRun: '尚未诊断',
  retestNone: '—',
  findingsUnit: (n: number) => `${n} 条`,
  actionRunning: '诊断中…',
  actionRetest: '发起回测',
  actionReconfigure: '重新配置',
  actionConfigure: '配置并分析',
  retestStarting: '发起中…',
  retestError: '发起失败',
  retestInProgress: '已有诊断进行中，查看',
}
const statusLabels = { output: '已完成', diagnosing: '诊断中' }
const runTypeLabels = { baseline: '基线', retest: '回测' }

const projects: ProjectSummaryItem[] = [
  {
    id: 'proj_a',
    domain: 'a.com',
    market: 'US',
    nextRetestDueAt: '2026-08-01',
    latestRun: { id: 'run_a', runType: 'baseline', status: 'output', startedAt: '2026-07-01', findingCount: 12 },
    activeRun: null,
    retestAnchor: { id: 'run_a' },
  },
  {
    id: 'proj_b',
    domain: 'b.com',
    market: 'CN',
    nextRetestDueAt: null,
    latestRun: null,
    activeRun: null,
    retestAnchor: null,
  },
]

function renderList(items = projects) {
  return render(
    <ProjectList
      locale="zh"
      projects={items}
      labels={labels}
      statusLabels={statusLabels}
      runTypeLabels={runTypeLabels}
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
