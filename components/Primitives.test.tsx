import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Panel } from './Panel'
import { SectionHeader } from './SectionHeader'
import { PageHeader } from './PageHeader'
import { Notice } from './Notice'
import { EmptyState } from './EmptyState'
import { Facts } from './Facts'
import { StatusText } from './StatusText'
import { Tag } from './Tag'

// 设计系统基础组件（design-system §4）的行为测试：结构、语义与无障碍属性。
describe('Panel', () => {
  it('有标题时渲染 h3 并用 aria-labelledby 关联', () => {
    render(
      <Panel title="品牌别名" titleId="p-alias">
        内容
      </Panel>,
    )
    expect(screen.getByRole('heading', { level: 3, name: '品牌别名' })).toHaveAttribute('id', 'p-alias')
    expect(screen.getByRole('region', { name: '品牌别名' })).toBeInTheDocument()
  })

  it('flush 密度用于直接放表格', () => {
    const { container } = render(<Panel density="flush">x</Panel>)
    expect(container.firstChild).toHaveClass('ui-panel', 'ui-panel--flush')
  })
})

describe('SectionHeader', () => {
  it('默认是 h2，可降为 h3', () => {
    const { rerender } = render(<SectionHeader title="结论" />)
    expect(screen.getByRole('heading', { level: 2, name: '结论' })).toBeInTheDocument()
    rerender(<SectionHeader title="结论" level={3} />)
    expect(screen.getByRole('heading', { level: 3, name: '结论' })).toBeInTheDocument()
  })
})

describe('PageHeader', () => {
  it('只渲染一个 h1，面包屑最后一项不是链接', () => {
    render(
      <PageHeader
        title="metadocu.com"
        crumbs={[{ label: '项目', href: '/zh/projects' }, { label: 'metadocu.com' }]}
        description="全球英文"
      />,
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('link', { name: '项目' })).toHaveAttribute('href', '/zh/projects')
    expect(screen.queryByRole('link', { name: 'metadocu.com' })).toBeNull()
  })
})

describe('Notice', () => {
  it('error 用 role=alert，其余用 role=status', () => {
    const { rerender } = render(<Notice tone="error">采集失败</Notice>)
    expect(screen.getByRole('alert')).toHaveTextContent('采集失败')
    rerender(<Notice tone="warn">规则已升级</Notice>)
    expect(screen.getByRole('status')).toHaveClass('ui-notice--warn')
  })

  it('info 是默认语气，不加修饰类', () => {
    render(<Notice>数据覆盖 3 / 5</Notice>)
    expect(screen.getByRole('status').className).toBe('ui-notice')
  })
})

describe('EmptyState', () => {
  it('渲染标题、原因与一个动作', () => {
    render(<EmptyState title="还没有项目" description="输入一个网址，先跑一次诊断" action={<button type="button">新建分析</button>} />)
    expect(screen.getByText('还没有项目')).toBeInTheDocument()
    expect(screen.getByText('输入一个网址，先跑一次诊断')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建分析' })).toBeInTheDocument()
  })
})

describe('Facts', () => {
  it('按 dt/dd 渲染，mono 项用等宽类', () => {
    render(
      <Facts
        items={[
          { label: '规则版本', value: 'rules_v4', mono: true },
          { label: '证据', value: '78 条' },
        ]}
      />,
    )
    expect(screen.getByText('规则版本').tagName).toBe('DT')
    expect(screen.getByText('rules_v4')).toHaveClass('ui-mono')
    expect(screen.getByText('78 条')).toHaveClass('ui-num')
  })
})

describe('StatusText / Tag', () => {
  it('状态类与文案分离：文案里不带 ✓', () => {
    render(<StatusText status="accepted" label="已接受" />)
    expect(screen.getByText('已接受')).toHaveClass('ui-status--accepted')
  })

  it('Tag 只有中性与强调两种语气', () => {
    render(<Tag tone="accent">自有</Tag>)
    expect(screen.getByText('自有').className).toBe('ui-tag ui-tag--accent')
  })
})
