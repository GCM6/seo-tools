import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProjectList, type ProjectSummaryItem } from './ProjectList'

const labels = {
  newAnalysis: '新建分析',
  colDomain: '域名',
  colLatest: '最近诊断',
  colFindings: '发现数',
  colRetest: '下次回测',
  empty: '还没有项目',
  noRun: '尚未诊断',
  retestNone: '—',
  findingsUnit: (n: number) => `${n} 条`,
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
  },
  { id: 'proj_b', domain: 'b.com', market: 'CN', nextRetestDueAt: null, latestRun: null },
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
})
