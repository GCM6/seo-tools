import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionNav, type SectionNavGroup } from './SectionNav'

// jsdom 没有 IntersectionObserver（同 ReportView.test.tsx 的先例做法）：补最小桩满足挂载
// 副作用，本文件只验证渲染结构与「过滤掉空分组」这条数据契约，不测真实滚动高亮（需要真实
// 浏览器 layout，超出组件单测范围）。
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error jsdom 环境没有该全局，测试期补一个最小桩
globalThis.IntersectionObserver ??= IntersectionObserverStub

describe('SectionNav', () => {
  it('按分组渲染标题与条目链接，链接指向对应锚点', () => {
    const groups: SectionNavGroup[] = [
      { label: '结论概览', items: [{ anchor: 'overview-section', label: '现状概览' }] },
      {
        label: 'AI 可见度',
        items: [
          { anchor: 'geo-presence-section', label: 'AI 回答证据索引' },
          { anchor: 'sentiment-section', label: '引用情感' },
        ],
      },
    ]
    render(<SectionNav groups={groups} ariaLabel="页面区块导航" />)

    expect(screen.getByRole('navigation', { name: '页面区块导航' })).toBeInTheDocument()
    expect(screen.getByText('结论概览')).toBeInTheDocument()
    expect(screen.getByText('AI 可见度')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '现状概览' })).toHaveAttribute('href', '#overview-section')
    expect(screen.getByRole('link', { name: '引用情感' })).toHaveAttribute('href', '#sentiment-section')
  })

  it('调用方按区块是否渲染过滤 items：空 items 的分组不出现在导航里', () => {
    const groups: SectionNavGroup[] = [
      { label: '结论概览', items: [{ anchor: 'overview-section', label: '现状概览' }] },
      { label: '传统搜索与竞品', items: [] },
    ]
    render(<SectionNav groups={groups} ariaLabel="页面区块导航" />)

    expect(screen.getByText('结论概览')).toBeInTheDocument()
    expect(screen.queryByText('传统搜索与竞品')).not.toBeInTheDocument()
  })

  it('所有分组都为空时整体不渲染', () => {
    const { container } = render(<SectionNav groups={[{ label: '空分组', items: [] }]} ariaLabel="页面区块导航" />)
    expect(container).toBeEmptyDOMElement()
  })
})
