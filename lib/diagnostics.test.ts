import { describe, it, expect } from 'vitest'
import { deriveStatCards, type EvidenceLike } from './diagnostics'

// 真实 SP2 run 采到的三类证据（全 L4）
const SP2_EVIDENCE: EvidenceLike[] = [
  { id: 'ev_pf', type: 'page_fetch', claimLevel: 'L4', payload: { robotsAllowed: true } },
  { id: 'ev_sc', type: 'schema', claimLevel: 'L4', payload: { types: ['Organization', 'FAQPage'] } },
  {
    id: 'ev_rc',
    type: 'render_check',
    claimLevel: 'L4',
    payload: { initialHtmlMainTextChars: 900, renderedMainTextChars: 1000, mainContentDelta: 100 },
  },
]

// demo run 的种子证据（render_check L4 + gsc L2 + ai_answer L3）
const DEMO_EVIDENCE: EvidenceLike[] = [
  {
    id: 'ev_render',
    type: 'render_check',
    claimLevel: 'L4',
    payload: { initialHtmlMainTextChars: 0, renderedMainTextChars: 1840, mainContentDelta: 1840 },
  },
  { id: 'ev_gsc', type: 'gsc', claimLevel: 'L2', payload: { avgPosition: 6.3 } },
  { id: 'ev_probe', type: 'ai_answer', claimLevel: 'L3', payload: { brandPresentCount: 0 } },
]

function card(cards: ReturnType<typeof deriveStatCards>, key: string) {
  return cards.find((c) => c.key === key)!
}

describe('deriveStatCards', () => {
  it('always returns the four fixed dashboard dimensions in order', () => {
    const keys = deriveStatCards([]).map((c) => c.key)
    expect(keys).toEqual(['aiVisibility', 'avgRank', 'crawlableText', 'schemaCoverage'])
  })

  it('marks everything pending on the correct SP when there is no evidence', () => {
    const cards = deriveStatCards([])
    expect(card(cards, 'aiVisibility')).toMatchObject({ state: 'pending', dependsOn: 'SP4' })
    expect(card(cards, 'avgRank')).toMatchObject({ state: 'pending', dependsOn: 'SP3' })
    expect(card(cards, 'crawlableText')).toMatchObject({ state: 'pending', dependsOn: 'SP2' })
    expect(card(cards, 'schemaCoverage')).toMatchObject({ state: 'pending', dependsOn: 'SP2' })
  })

  it('derives real measured cards from SP2 evidence (render_check + schema)', () => {
    const cards = deriveStatCards(SP2_EVIDENCE)
    // 正文可抓取占比 = initial/rendered = 900/1000 = 90%
    expect(card(cards, 'crawlableText')).toEqual({ key: 'crawlableText', state: 'measured', value: '90', level: 'L4', evidenceId: 'ev_rc' })
    // 结构化数据类型数 = 2
    expect(card(cards, 'schemaCoverage')).toEqual({ key: 'schemaCoverage', state: 'measured', value: '2', level: 'L4', evidenceId: 'ev_sc' })
    // AI 可见度 / 平均排名 无对应证据 → 待接入
    expect(card(cards, 'aiVisibility')).toMatchObject({ state: 'pending', dependsOn: 'SP4' })
    expect(card(cards, 'avgRank')).toMatchObject({ state: 'pending', dependsOn: 'SP3' })
  })

  it('derives avgRank and a 0% crawlable from demo seed evidence', () => {
    const cards = deriveStatCards(DEMO_EVIDENCE)
    expect(card(cards, 'avgRank')).toEqual({ key: 'avgRank', state: 'measured', value: '6.3', level: 'L2', evidenceId: 'ev_gsc' })
    // initial 0 / rendered 1840 → 0%（正文全靠 JS 渲染，AI 抓不到）
    expect(card(cards, 'crawlableText')).toEqual({ key: 'crawlableText', state: 'measured', value: '0', level: 'L4', evidenceId: 'ev_render' })
    // demo 没有 schema 证据 → 待接入
    expect(card(cards, 'schemaCoverage')).toMatchObject({ state: 'pending', dependsOn: 'SP2' })
  })

  it('clamps crawlable ratio to 100 when initial exceeds rendered', () => {
    const cards = deriveStatCards([
      { id: 'ev_x', type: 'render_check', claimLevel: 'L4', payload: { initialHtmlMainTextChars: 1200, renderedMainTextChars: 1000, mainContentDelta: -200 } },
    ])
    expect(card(cards, 'crawlableText')).toMatchObject({ state: 'measured', value: '100' })
  })
})
