import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { getWorkflowStep, Stepper } from './Stepper'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    ({
      progressLabel: '分析进度',
      new: '新建分析',
      diagnose: '诊断',
      recommend: '优化建议',
      output: '输出',
      inProgress: '进行中',
      completed: '已完成',
      interrupted: '已中断',
      reviewPending: '待确认 {count} 条',
    }[key] ?? key).replace('{count}', String(values?.count ?? '')),
}))

describe('Stepper', () => {
  it.each([
    [undefined, 1],
    ['draft', 2],
    ['collecting', 2],
    ['diagnosing', 2],
    ['reviewing', 3],
    ['output', 4],
    ['failed', 2],
  ] as const)('将 %s 映射到第 %i 步', (status, expectedStep) => {
    expect(getWorkflowStep(status)).toBe(expectedStep)
  })

  it('呈现为只读进度，不暴露可越级点击的链接', () => {
    render(<Stepper status="collecting" />)

    expect(screen.getByRole('list', { name: '分析进度' })).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('新建分析').closest('[role="listitem"]')).toHaveClass('done')
    expect(screen.getByText('诊断').closest('[role="listitem"]')).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('失败时在诊断步骤明确标为中断', () => {
    render(<Stepper status="failed" />)

    expect(screen.getByText('已中断')).toBeInTheDocument()
    expect(screen.getByText('诊断').closest('[role="listitem"]')).toHaveClass('failed')
  })

  it('建议待确认时显示阻塞数量', () => {
    render(<Stepper status="reviewing" pendingRecommendationCount={3} />)

    expect(screen.getByText('待确认 3 条')).toBeInTheDocument()
  })
})
