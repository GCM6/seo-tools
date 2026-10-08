import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PriorityMatrix } from './PriorityMatrix'
import type { ReportRecommendation } from '@/lib/diagnosis/report'

function rec(id: string, what: string, priority: string): ReportRecommendation {
  return { id, findingId: `f_${id}`, what, why: '', expectedImpact: '高', effort: '低', priority, confidence: '', status: 'accepted', outcome: '', validationMethod: '' } as ReportRecommendation
}

const labels = {
  quadrants: { quick_win: '速赢', strategic: '战略', fill_in: '填充', low: '低优先' },
  quickWinsTitle: '速赢清单',
  axisImpact: '影响',
  axisEffort: '成本',
  high: '高',
  low: '低',
  count: (n: number) => `${n} 项`,
  empty: '暂无建议。',
  target: '针对：',
}

describe('PriorityMatrix', () => {
  it('只显示动作句，修复示例代码不混进矩阵；同名建议靠「针对：问题」区分', () => {
    const matrix = {
      quick_win: [rec('a', '移除 noindex\n\n参考修复示例（静态模板，非生成内容）：\n<meta name="robots" content="index" />', 'quick_win')],
      strategic: [],
      fill_in: [rec('b', '优化内容页', 'fill_in'), rec('c', '优化内容页', 'fill_in')],
      low: [],
    }
    const { container } = render(<PriorityMatrix matrix={matrix} labels={labels} targets={{ b: 'AI 答案可见度偏低', c: '品牌第三方语料缺失' }} />)
    expect(container.textContent).not.toContain('<meta')
    const fill = screen.getByText('填充').closest('[role="cell"]') as HTMLElement
    expect(within(fill).getByText('针对：AI 答案可见度偏低')).toBeInTheDocument()
    expect(within(fill).getByText('针对：品牌第三方语料缺失')).toBeInTheDocument()
    expect(screen.getAllByText('暂无建议。')).toHaveLength(2)
  })
})
