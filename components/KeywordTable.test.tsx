import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import zhMessages from '@/messages/zh.json'
import { KeywordTable, type KeywordMetricRow, type KeywordGapRow } from './KeywordTable'

// KeywordTable 是 'use client' 组件（P1-8 重构：为了支持可点击排序表头，从 async Server
// Component 改为 client component，i18n 从 getTranslations 换成 useTranslations）。复用
// ActionList.test.tsx 的先例：mock 'next-intl' 的 useTranslations，用真实 zh.json 消息桥接，
// 而不是硬编码 key→中文 map——这样文案改名/占位符替换是否 work 都测得出来。
function resolveMessage(namespace: string | undefined, key: string, vars?: Record<string, unknown>): string {
  const path = [...(namespace ? namespace.split('.') : []), ...key.split('.')]
  let node: unknown = zhMessages
  for (const p of path) {
    if (typeof node !== 'object' || node === null) throw new Error(`missing message: ${namespace ?? ''}.${key}`)
    node = (node as Record<string, unknown>)[p]
  }
  if (typeof node !== 'string') throw new Error(`missing message: ${namespace ?? ''}.${key}`)
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`))
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, vars?: Record<string, unknown>) => resolveMessage(namespace, key, vars),
}))

function metricRow(overrides: Partial<KeywordMetricRow>): KeywordMetricRow {
  return {
    id: 'km_1',
    keywordId: 'kw_1',
    clicks: 1,
    impressions: 10,
    ctr: '0.1',
    position: '5',
    source: 'gsc',
    ...overrides,
  }
}

function gapRow(overrides: Partial<KeywordGapRow>): KeywordGapRow {
  return {
    id: 'kg_1',
    keywordId: 'kw_1',
    gapType: 'missing',
    ourPosition: null,
    opportunityScore: '50',
    ...overrides,
  }
}

function keywordRowTexts(): HTMLElement[] {
  return screen.getAllByRole('row').slice(1) // 去掉表头行
}

describe('KeywordTable — 格式化（沿用既有断言，合并单表后行为不变）', () => {
  it('position：未截断的裸浮点小数格式化为 1 位小数', () => {
    render(<KeywordTable keywordMetrics={[metricRow({ id: 'km_a', position: '50.6666666666667' })]} keywordGaps={[]} keywordText={{}} />)
    expect(screen.getByText('50.7')).toBeInTheDocument()
    expect(screen.queryByText('50.6666666666667')).not.toBeInTheDocument()
  })

  it('position：整数原样展示，不补小数位', () => {
    render(<KeywordTable keywordMetrics={[metricRow({ id: 'km_b', position: '73' })]} keywordGaps={[]} keywordText={{}} />)
    expect(screen.getByText('73')).toBeInTheDocument()
    expect(screen.queryByText('73.0')).not.toBeInTheDocument()
  })

  it('ctr：0 展示为 0%', () => {
    render(<KeywordTable keywordMetrics={[metricRow({ id: 'km_c', ctr: '0' })]} keywordGaps={[]} keywordText={{}} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('ctr：0–1 小数按百分比换算并保留 1 位小数', () => {
    render(<KeywordTable keywordMetrics={[metricRow({ id: 'km_d', ctr: '0.0333' })]} keywordGaps={[]} keywordText={{}} />)
    expect(screen.getByText('3.3%')).toBeInTheDocument()
  })

  it('position 为 null 时展示 —', () => {
    render(<KeywordTable keywordMetrics={[metricRow({ id: 'km_e', position: null })]} keywordGaps={[]} keywordText={{}} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('非数字字符串原样透传（不崩溃、不强转为 0 或 NaN）', () => {
    render(<KeywordTable keywordMetrics={[metricRow({ id: 'km_f', position: 'n/a' })]} keywordGaps={[]} keywordText={{}} />)
    expect(screen.getByText('n/a')).toBeInTheDocument()
  })
})

describe('KeywordTable — 合并单表（P1-8：同一关键词的实测指标与缺口不再拆两张表）', () => {
  it('同一 keywordId 既有 metrics 又有 gap 时合并为一行，两枚类型徽标同显', () => {
    render(
      <KeywordTable
        keywordMetrics={[metricRow({ id: 'km_1', keywordId: 'kw_dup', clicks: 5 })]}
        keywordGaps={[gapRow({ id: 'kg_1', keywordId: 'kw_dup', gapType: 'weak' })]}
        keywordText={{ kw_dup: { text: '重叠词', volume: 200, difficulty: null } }}
      />,
    )
    const rows = keywordRowTexts()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('实测')).toBeInTheDocument()
    expect(within(rows[0]).getByText('缺口 · 薄弱')).toBeInTheDocument()
  })

  it('无数据的空态：两个数组都为空时展示空态提示', () => {
    render(<KeywordTable keywordMetrics={[]} keywordGaps={[]} keywordText={{}} />)
    expect(screen.getByText('未接入 GSC / DataForSEO，暂无关键词数据。')).toBeInTheDocument()
  })
})

describe('KeywordTable — 默认排序（P1-8：repository 层已 orderBy，组件侧对合并结果做兜底默认序）', () => {
  it('纯 metrics 数据集：默认按 clicks 降序渲染', () => {
    render(
      <KeywordTable
        keywordMetrics={[
          metricRow({ id: 'km_low', keywordId: 'kw_low', clicks: 3 }),
          metricRow({ id: 'km_high', keywordId: 'kw_high', clicks: 50 }),
          metricRow({ id: 'km_mid', keywordId: 'kw_mid', clicks: 12 }),
        ]}
        keywordGaps={[]}
        keywordText={{
          kw_low: { text: '低点击词', volume: null, difficulty: null },
          kw_high: { text: '高点击词', volume: null, difficulty: null },
          kw_mid: { text: '中点击词', volume: null, difficulty: null },
        }}
      />,
    )
    const rows = keywordRowTexts()
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['高点击词', '中点击词', '低点击词'])
  })

  it('纯 gaps 数据集（无 clicks）：默认按 opportunity 降序渲染', () => {
    render(
      <KeywordTable
        keywordMetrics={[]}
        keywordGaps={[
          gapRow({ id: 'kg_low', keywordId: 'kw_low', opportunityScore: '9' }),
          gapRow({ id: 'kg_high', keywordId: 'kw_high', opportunityScore: '85.5' }),
          gapRow({ id: 'kg_mid', keywordId: 'kw_mid', opportunityScore: '40' }),
        ]}
        keywordText={{
          kw_low: { text: '低机会词', volume: null, difficulty: null },
          kw_high: { text: '高机会词', volume: null, difficulty: null },
          kw_mid: { text: '中机会词', volume: null, difficulty: null },
        }}
      />,
    )
    const rows = keywordRowTexts()
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['高机会词', '中机会词', '低机会词'])
  })
})

describe('KeywordTable — 点击表头切换排序（P1-8）', () => {
  it('点击"点击"列表头：从默认降序切到升序', async () => {
    const { fireEvent } = await import('@testing-library/react')
    render(
      <KeywordTable
        keywordMetrics={[
          metricRow({ id: 'km_low', keywordId: 'kw_low', clicks: 3 }),
          metricRow({ id: 'km_high', keywordId: 'kw_high', clicks: 50 }),
        ]}
        keywordGaps={[]}
        keywordText={{
          kw_low: { text: '低点击词', volume: null, difficulty: null },
          kw_high: { text: '高点击词', volume: null, difficulty: null },
        }}
      />,
    )
    // 默认降序：高点击词在前。
    expect(keywordRowTexts().map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['高点击词', '低点击词'])

    const clicksHeaderButton = screen.getByRole('button', { name: '点击' })
    // 第一次点击：sort.key 从内部态 'default' 切到显式 'clicks'，首次落地是降序（约定：任意列
    // 头首次点击都先降序），此时视觉顺序与默认序恰好相同——但 aria-sort 已从 'none' 变为
    // 'descending'，证明这次点击确实把排序键切到了该列，而不是没反应。
    expect(clicksHeaderButton.closest('th')).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(clicksHeaderButton)
    expect(clicksHeaderButton.closest('th')).toHaveAttribute('aria-sort', 'descending')
    // 第二次点击：同列再点 → 切到升序，行序反转。
    fireEvent.click(clicksHeaderButton)
    expect(clicksHeaderButton.closest('th')).toHaveAttribute('aria-sort', 'ascending')
    expect(keywordRowTexts().map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['低点击词', '高点击词'])
  })
})

describe('KeywordTable — 超过 50 条时的截断与展开（P1-8）', () => {
  function manyMetrics(n: number): KeywordMetricRow[] {
    return Array.from({ length: n }, (_, i) => metricRow({ id: `km_${i}`, keywordId: `kw_${i}`, clicks: n - i }))
  }
  function manyKeywordText(n: number) {
    return Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`kw_${i}`, { text: `词${i}`, volume: null, difficulty: null }] as const),
    )
  }

  it('超过 50 条：首屏只渲染前 50 行，并展示"显示全部（共 N 条）"按钮', () => {
    render(<KeywordTable keywordMetrics={manyMetrics(60)} keywordGaps={[]} keywordText={manyKeywordText(60)} />)
    expect(keywordRowTexts()).toHaveLength(50)
    expect(screen.getByRole('button', { name: '显示全部（共 60 条）' })).toBeInTheDocument()
  })

  it('点击"显示全部"后渲染全部行；不足 50 条时不展示展开按钮', async () => {
    const { fireEvent } = await import('@testing-library/react')
    render(<KeywordTable keywordMetrics={manyMetrics(60)} keywordGaps={[]} keywordText={manyKeywordText(60)} />)
    fireEvent.click(screen.getByRole('button', { name: '显示全部（共 60 条）' }))
    expect(keywordRowTexts()).toHaveLength(60)
    expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument()
  })

  it('不超过 50 条时不展示展开按钮', () => {
    render(<KeywordTable keywordMetrics={manyMetrics(10)} keywordGaps={[]} keywordText={manyKeywordText(10)} />)
    expect(keywordRowTexts()).toHaveLength(10)
    expect(screen.queryByText(/显示全部/)).not.toBeInTheDocument()
  })
})
