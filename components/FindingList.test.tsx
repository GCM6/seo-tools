import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { FindingCard, FindingList, type FindingItem } from './FindingList'
import zhMessages from '@/messages/zh.json'

describe('FindingCard', () => {
  it('toggles evidence drawer on click', () => {
    render(
      <FindingCard
        id="f1"
        title="t"
        provVariant="m"
        provLabel="实测"
        confidence=""
        severity="hi"
        labels={{ dismiss: '忽略此发现', dismissed: '已忽略' }}
      >
        <div>evidence-body</div>
      </FindingCard>,
    )
    expect(screen.queryByText('evidence-body')).not.toBeVisible()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('evidence-body')).toBeVisible()
  })

  // P1-5：confidence 与徽章 label 同源（confidenceLabel(claimType)），此前二者各渲染
  // 一次造成重复展示。徽章保留，纯文本不再单独渲染。
  it('不再重复渲染 confidence 纯文本（只保留徽章）', () => {
    render(
      <FindingCard
        id="f1"
        title="t"
        provVariant="m"
        provLabel="实测"
        confidence="实测"
        severity="hi"
        labels={{ dismiss: '忽略此发现', dismissed: '已忽略' }}
      >
        <div>evidence-body</div>
      </FindingCard>,
    )
    // “实测”应只来自徽章，不应再有单独的 find-conf 文本节点
    expect(screen.getAllByText('实测')).toHaveLength(1)
    expect(document.querySelector('.find-conf')).toBeNull()
  })

  it('徽章带 title/aria-label 就近解释', () => {
    render(
      <FindingCard
        id="f1"
        title="t"
        provVariant="m"
        provLabel="实测"
        confidence="实测"
        provHint="实测：有 L3/L4 硬证据支撑"
        severity="hi"
        labels={{ dismiss: '忽略此发现', dismissed: '已忽略' }}
      >
        <div>evidence-body</div>
      </FindingCard>,
    )
    expect(screen.getByTitle('实测：有 L3/L4 硬证据支撑')).toBeInTheDocument()
  })
})

describe('FindingList', () => {
  const baseItem: FindingItem = {
    id: 'f1',
    side: 'geo',
    title: '示例发现',
    provVariant: 'm',
    provLabel: '实测',
    confidence: '实测',
    severity: 'hi',
    evidence: <div>ev</div>,
  }

  function renderList(items: FindingItem[]) {
    return render(
      <NextIntlClientProvider locale="zh" messages={zhMessages}>
        <FindingList items={items} />
      </NextIntlClientProvider>,
    )
  }

  it('列表头部展示证据等级图例', () => {
    renderList([baseItem])
    expect(screen.getByText(/证据等级说明/)).toBeInTheDocument()
  })

  it('传给 FindingCard 的徽章带就近解释 title', () => {
    renderList([baseItem])
    expect(screen.getByTitle('实测：有 L3/L4 硬证据支撑')).toBeInTheDocument()
  })
})
