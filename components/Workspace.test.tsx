import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Lifecycle } from './Lifecycle'
import { WorkspaceTabs } from './WorkspaceTabs'
import { DomainCountTable } from './DomainCountTable'
import { IssueSummary, rankIssues } from './IssueSummary'
import { MarkdownPreview } from './MarkdownPreview'
import { lifecycleSteps } from '@/lib/runs/workspace'

// 诊断工作区新组件的行为测试（ux-blueprint §3 / design-system §4）。
const lifeLabels = { collect: '采集证据', diagnose: '生成诊断', review: '确认建议', execute: '执行', retest: '4–6 周后复查' }

describe('Lifecycle', () => {
  it('当前步带 aria-current=step，完成步带 ✓，计数紧跟步骤名', () => {
    render(
      <Lifecycle
        steps={lifecycleSteps('output', { total: 15, draft: 0, decided: 15, applied: 0 })}
        labels={lifeLabels}
        failedLabel="未完成"
        ariaLabel="诊断进度"
      />,
    )
    const list = screen.getByRole('list', { name: '诊断进度' })
    const current = within(list).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step')
    expect(current).toHaveTextContent('执行0/15')
    expect(within(list).getAllByText('✓')).toHaveLength(3)
  })

  it('进度只显示状态，不渲染任何链接（不再兼做导航）', () => {
    render(<Lifecycle steps={lifecycleSteps('reviewing', { total: 2, draft: 1, decided: 1, applied: 0 })} labels={lifeLabels} failedLabel="未完成" ariaLabel="诊断进度" />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})

describe('WorkspaceTabs', () => {
  it('当前视图带 aria-current=page，计数紧跟标签', () => {
    render(
      <WorkspaceTabs
        current="issues"
        ariaLabel="诊断视图"
        asideLabel="原始数据"
        main={[
          { view: 'overview', href: '/zh/runs/r', label: '概览' },
          { view: 'issues', href: '/zh/runs/r/issues', label: '问题', count: '15' },
        ]}
        aside={[{ view: 'site', href: '/zh/runs/r/site', label: '站点结构' }]}
      />,
    )
    expect(screen.getByRole('link', { name: '问题15' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '概览' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '站点结构' })).toHaveAttribute('href', '/zh/runs/r/site')
  })
})

describe('DomainCountTable', () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({ domain: `d${i}.com`, count: 13 - i, own: i === 3 }))
  const labels = { domain: '域名', count: '引用次数', own: '你的域名', showAll: '显示全部 13 个', showLess: '只看前 10 个' }

  it('超过 10 行默认只显示前 10 行，可展开再收起', () => {
    render(<DomainCountTable rows={rows} labels={labels} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: '显示全部 13 个' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(13)
    expect(screen.getByRole('button', { name: '只看前 10 个' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('自有域名行带 owned 类与强调标签', () => {
    render(<DomainCountTable rows={rows} labels={labels} />)
    const own = screen.getByText('d3.com').closest('li')
    expect(own).toHaveClass('owned')
    expect(own).toHaveTextContent('你的域名')
  })

  it('不足 10 行时不显示展开按钮', () => {
    render(<DomainCountTable rows={rows.slice(0, 3)} labels={labels} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('rankIssues / IssueSummary', () => {
  it('严重度优先，同严重度时证据越硬越靠前', () => {
    const ranked = rankIssues([
      { id: 'a', severity: 'ok', grade: 'hard' as const },
      { id: 'b', severity: 'mid', grade: 'inferred' as const },
      { id: 'c', severity: 'high', grade: 'sample' as const },
      { id: 'd', severity: 'mid', grade: 'hard' as const },
    ])
    expect(ranked.map((r) => r.id)).toEqual(['c', 'd', 'b', 'a'])
  })

  it('每条问题链接到「问题」视图里对应的锚点', () => {
    render(
      <IssueSummary
        issuesHref="/zh/runs/r/issues"
        items={[{ id: 'f1', title: '页面存在 noindex 误用', severity: 'high', severityLabel: '高', grade: 'hard', gradeLabel: '实测', pillarLabel: 'P1 技术健康' }]}
      />,
    )
    expect(screen.getByRole('link', { name: '页面存在 noindex 误用' })).toHaveAttribute('href', '/zh/runs/r/issues#f1')
    expect(screen.getByText('高')).toHaveClass('ui-sev--high')
  })
})

describe('MarkdownPreview 行内格式', () => {
  it('把 **加粗** 与 `代码` 渲染成元素，不显示 ** 原文', () => {
    const { container } = render(<MarkdownPreview markdown={'It may be **Metadocu** or `meta` tool.'} />)
    expect(container.querySelector('strong')).toHaveTextContent('Metadocu')
    expect(container.querySelector('code')).toHaveTextContent('meta')
    expect(container.textContent).not.toContain('**')
  })

  it('不解析 HTML：尖括号原样作为文本', () => {
    const { container } = render(<MarkdownPreview markdown={'<meta name="robots" content="index">'} />)
    expect(container.querySelector('meta')).toBeNull()
    expect(container.textContent).toContain('<meta name="robots"')
  })
})
