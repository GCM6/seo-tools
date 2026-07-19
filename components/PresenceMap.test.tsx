import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { PresenceMap, type PresencePrompt } from './PresenceMap'
import zhMessages from '@/messages/zh.json'

function renderMap(prompts: PresencePrompt[], unbranded: { present: number; total: number; wilsonLow: number }) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <PresenceMap prompts={prompts} unbranded={unbranded} />
    </NextIntlClientProvider>,
  )
}

const unbrandedPrompts: PresencePrompt[] = [
  {
    text: '哪些工具能做 SEO 诊断？',
    present: true,
    branded: false,
    answers: [{ provider: 'openai', answerText: '包括 Veris 等工具……', evidenceId: 'ev_u1', present: true }],
  },
  {
    text: '如何做 GEO 优化？',
    present: false,
    branded: false,
    answers: [{ provider: 'openai', answerText: '常见做法是……', evidenceId: 'ev_u2', present: false }],
  },
]

const brandedPrompts: PresencePrompt[] = [
  {
    text: 'Veris 是什么？',
    present: true,
    branded: true,
    answers: [
      // 联网引擎、有引用 → grounded
      {
        provider: 'openai',
        answerText: 'Veris 是一款证据化 SEO+GEO 诊断工具，参见官网。',
        evidenceId: 'ev_b1',
        present: true,
        citedUrls: ['https://veris.example.com'],
        webSearchEnabled: true,
      },
      // 联网引擎、无引用、hedged → speculative
      {
        provider: 'perplexity',
        answerText: 'Veris 可能是 Verification 的缩写。',
        evidenceId: 'ev_b2',
        present: true,
        citedUrls: [],
        hedged: true,
        webSearchEnabled: true,
      },
      // 非联网引擎、无 hedge/无承认 → undetermined
      {
        provider: 'deepseek',
        answerText: 'Veris 是一个诊断品牌。',
        evidenceId: 'ev_b3',
        present: true,
        citedUrls: [],
        webSearchEnabled: false,
      },
    ],
  },
]

describe('PresenceMap', () => {
  it('prompts 为空时不渲染', () => {
    const { container } = renderMap([], { present: 0, total: 0, wilsonLow: 0 })
    expect(container).toBeEmptyDOMElement()
  })

  it('渲染无品牌提问结论与品牌提问认知质量两区', () => {
    renderMap([...unbrandedPrompts, ...brandedPrompts], { present: 1, total: 2, wilsonLow: 0.15 })
    expect(screen.getByText('本轮结论 · 无品牌提问')).toBeInTheDocument()
    expect(screen.getByText('品牌提问 · AI 认知质量')).toBeInTheDocument()
  })

  it('上区头条使用传入的 unbranded 口径而非重新计算', () => {
    renderMap([...unbrandedPrompts, ...brandedPrompts], { present: 1, total: 2, wilsonLow: 0.15 })
    expect(screen.getByText('无品牌提问中，品牌出现于 1/2 个')).toBeInTheDocument()
    expect(screen.getByText('95% 置信下限 15%——n 小，单轮数字波动大，回测须两轮区间不重叠才可称「变化」')).toBeInTheDocument()
  })

  it('将 0/Y 的主动召回结果前置为一句可理解的结论，并保留竞品对照入口', () => {
    renderMap(
      [
        { ...unbrandedPrompts[0], present: false, answers: [{ ...unbrandedPrompts[0].answers[0], present: false }] },
        unbrandedPrompts[1],
      ],
      { present: 0, total: 2, wilsonLow: 0 },
    )
    expect(screen.getByText('AI 尚未在无品牌提问中主动提到你的品牌')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '主动召回 0/2' })).toBeInTheDocument()
    expect(screen.getByText('查看竞品如何被提及 →')).toHaveAttribute('href', '#sov-section')
  })

  it('present > 0 时给出部分召回的正向结论', () => {
    renderMap(unbrandedPrompts, { present: 1, total: 2, wilsonLow: 0.15 })
    expect(screen.getByText('AI 已在部分无品牌提问中主动提到你的品牌')).toBeInTheDocument()
  })

  it('下区没有品牌提问时展示空态文案', () => {
    renderMap(unbrandedPrompts, { present: 1, total: 2, wilsonLow: 0.15 })
    expect(screen.getByText('本轮没有品牌提问相关的探针回答。')).toBeInTheDocument()
  })

  it('下区按回答粒度渲染五态格子并计入图例计数', () => {
    renderMap(brandedPrompts, { present: 0, total: 0, wilsonLow: 0 })
    expect(screen.getByText('有依据（1）')).toBeInTheDocument()
    expect(screen.getByText('疑似臆测（1）')).toBeInTheDocument()
    expect(screen.getByText('未判定（1）')).toBeInTheDocument()
    expect(screen.getByText('承认不知道（0）')).toBeInTheDocument()
    expect(screen.getByText('断言无依据（0）')).toBeInTheDocument()
  })

  it('点击 grounded 格子：详情区显示检索型徽标与原文', () => {
    renderMap(brandedPrompts, { present: 0, total: 0, wilsonLow: 0 })
    const cells = screen.getByLabelText('按回答排列的品牌认知质量索引').querySelectorAll('button')
    fireEvent.click(cells[0])
    expect(screen.getByText('检索型')).toBeInTheDocument()
    expect(screen.getByText('Veris 是一款证据化 SEO+GEO 诊断工具，参见官网。')).toBeInTheDocument()
  })

  it('点击非联网引擎（undetermined）格子：显示记忆型徽标与无引用能力提示', () => {
    renderMap(brandedPrompts, { present: 0, total: 0, wilsonLow: 0 })
    const cells = screen.getByLabelText('按回答排列的品牌认知质量索引').querySelectorAll('button')
    fireEvent.click(cells[2])
    expect(screen.getByText('记忆型')).toBeInTheDocument()
    expect(screen.getByText(/该引擎无引用能力/)).toBeInTheDocument()
    expect(screen.getByText(/反映训练语料记忆/)).toBeInTheDocument()
  })
})
