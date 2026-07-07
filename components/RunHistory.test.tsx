import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RunHistory, type RunHistoryItem } from './RunHistory'

const labels = {
  colTime: '时间',
  colType: '类型',
  colStatus: '状态',
  colFindings: '发现数',
  colAction: '操作',
  viewRun: '查看',
  viewReport: '报告',
  noRuns: '该项目还没有诊断记录。',
}
const statusLabels = { output: '已完成', diagnosing: '诊断中' }
const runTypeLabels = { baseline: '基线', retest: '回测' }

const runs: RunHistoryItem[] = [
  { id: 'run_done', runType: 'baseline', status: 'output', startedAt: '2026-07-01', findingCount: 8 },
  { id: 'run_wip', runType: 'retest', status: 'diagnosing', startedAt: '2026-07-05', findingCount: 0 },
]

function renderHistory(items = runs) {
  return render(
    <RunHistory
      locale="zh"
      runs={items}
      labels={labels}
      statusLabels={statusLabels}
      runTypeLabels={runTypeLabels}
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
    renderHistory([])
    expect(screen.getByText('该项目还没有诊断记录。')).toBeInTheDocument()
  })
})
