import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RunHistory, type RunHistoryItem } from './RunHistory'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const labels = {
  colTime: '时间',
  colType: '类型',
  colStatus: '状态',
  colFindings: '发现数',
  colAction: '操作',
  viewRun: '查看',
  viewReport: '报告',
  noRuns: '该项目还没有诊断记录。',
  retestThis: '以此回测',
  retestStarting: '发起中…',
  retestError: '发起失败',
  retestInProgress: '已有诊断进行中，查看',
}
const statusLabels = { output: '已完成', diagnosing: '诊断中' }
const runTypeLabels = { baseline: '基线', retest: '回测' }

const runs: RunHistoryItem[] = [
  { id: 'run_done', runType: 'baseline', status: 'output', startedAt: '2026-07-01', findingCount: 8 },
  { id: 'run_wip', runType: 'retest', status: 'diagnosing', startedAt: '2026-07-05', findingCount: 0 },
]

function renderHistory(props: Partial<Parameters<typeof RunHistory>[0]> = {}) {
  return render(
    <RunHistory
      locale="zh"
      runs={runs}
      labels={labels}
      statusLabels={statusLabels}
      runTypeLabels={runTypeLabels}
      {...props}
    />,
  )
}

describe('RunHistory', () => {
  it('渲染 run 行的时间/类型/状态', () => {
    renderHistory()
    expect(screen.getByText('2026-07-01')).toBeInTheDocument()
    expect(screen.getByText('基线')).toBeInTheDocument()
    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByText('回测')).toBeInTheDocument()
  })

  it('每行有查看链接；output 状态另给报告链接', () => {
    renderHistory()
    const viewLinks = screen.getAllByRole('link', { name: '查看' })
    expect(viewLinks[0]).toHaveAttribute('href', '/zh/runs/run_done')
    // output 才有报告链接：只有一个
    const reportLinks = screen.getAllByRole('link', { name: '报告' })
    expect(reportLinks).toHaveLength(1)
    expect(reportLinks[0]).toHaveAttribute('href', '/zh/runs/run_done/report')
  })

  it('空历史显示空态', () => {
    renderHistory({ runs: [] })
    expect(screen.getByText('该项目还没有诊断记录。')).toBeInTheDocument()
  })

  describe('「以此回测」（spec §2.2）', () => {
    it('baseline 且完成态的行出现「以此回测」按钮，retest 行不出现', () => {
      renderHistory()
      const retestButtons = screen.getAllByRole('button', { name: '以此回测' })
      expect(retestButtons).toHaveLength(1)
    })

    it('hasActiveRun=true 时「以此回测」按钮渲染为禁用态', () => {
      renderHistory({ hasActiveRun: true })
      expect(screen.getByRole('button', { name: '以此回测' })).toBeDisabled()
    })

    it('hasActiveRun=false（默认）时「以此回测」按钮可用', () => {
      renderHistory()
      expect(screen.getByRole('button', { name: '以此回测' })).not.toBeDisabled()
    })
  })
})
