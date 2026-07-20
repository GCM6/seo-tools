import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { RunProgress } from './RunProgress'
import zhMessages from '@/messages/zh.json'

// initialStatus 传入的都是 'output'（已折叠为 collected 视觉态），不触发 EventSource 订阅，
// 无需 mock EventSource；仍需 mock useRouter，组件里的死按钮分支会用到它。
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

function renderProgress(props: Partial<Parameters<typeof RunProgress>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <RunProgress runId="run_a" initialStatus="output" {...props} />
    </NextIntlClientProvider>,
  )
}

describe('RunProgress reviewGate（P0-1 诊断完成时刻前进出口）', () => {
  it('pendingCount>0：渲染待确认标题与指向 recommendations 的链接，不渲染死按钮', () => {
    renderProgress({
      reviewGate: { pendingCount: 3, totalCount: 5, href: '/zh/runs/run_a/recommendations' },
    })

    expect(screen.getByText('还有 3 条优化建议待确认')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /现在去确认 3 条优化建议/ })
    expect(link).toHaveAttribute('href', '/zh/runs/run_a/recommendations')
    expect(screen.queryByRole('button', { name: '查看诊断结果' })).not.toBeInTheDocument()
  })

  it('全部已决策（pendingCount=0，totalCount>0）：渲染 outputAction 链接指向 output 页', () => {
    renderProgress({
      reviewGate: { pendingCount: 0, totalCount: 5, href: '/zh/runs/run_a/output' },
    })

    expect(screen.getByText('优化建议已全部确认，输出已就绪')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /查看输出/ })
    expect(link).toHaveAttribute('href', '/zh/runs/run_a/output')
    expect(screen.queryByRole('button', { name: '查看诊断结果' })).not.toBeInTheDocument()
  })

  it('totalCount=0（本轮未生成建议）：渲染 emptyTitle 分支，链接指向 recommendations', () => {
    renderProgress({
      reviewGate: { pendingCount: 0, totalCount: 0, href: '/zh/runs/run_a/recommendations' },
    })

    expect(screen.getByText('尚未生成可确认的优化建议')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /查看诊断结果/ })
    expect(link).toHaveAttribute('href', '/zh/runs/run_a/recommendations')
    expect(screen.queryByRole('button', { name: '查看诊断结果' })).not.toBeInTheDocument()
  })

  it('未传 reviewGate：保持原有行为，渲染通用完成标题与死按钮（router.refresh）', () => {
    renderProgress()

    expect(screen.getByText('诊断证据已就绪')).toBeInTheDocument()
    const viewResultsBtn = screen.getByRole('button', { name: '查看诊断结果' })
    expect(viewResultsBtn).toBeInTheDocument()
    // D5：完成态按钮补样式，不再是裸 <button>（回归此前 className="mt-3" 的默认浏览器外观）。
    expect(viewResultsBtn).toHaveClass('rp-action')
  })
})

describe('RunProgress 失败态操作按钮（D5：重试按钮补样式）', () => {
  it('failed 状态：渲染带 rp-action-retry 样式的重试按钮，不再是完全无 className 的裸按钮', () => {
    renderProgress({ initialStatus: 'failed', initialFailureReason: 'timeout' })

    const retryBtn = screen.getByRole('button', { name: '重试采集' })
    expect(retryBtn).toHaveClass('rp-action-retry')
  })
})
