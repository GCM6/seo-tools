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

// GSC + render_check evidence from a real run fixture.
const MIXED_EVIDENCE: EvidenceLike[] = [
  {
    id: 'ev_serp',
    type: 'serp_snapshot',
    claimLevel: 'L2',
    payload: { totalResults: 12, resultCount: 10, query: 'site:example.com' },
  },
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
    expect(keys).toEqual(['indexVisibility', 'aiVisibility', 'avgRank', 'crawlableText', 'schemaCoverage'])
  })

  it('marks everything pending with the right reason when there is no evidence', () => {
    const cards = deriveStatCards([])
    expect(card(cards, 'indexVisibility')).toMatchObject({ state: 'pending', reason: 'search_provider' })
    expect(card(cards, 'aiVisibility')).toMatchObject({ state: 'pending', reason: 'ai_probe' })
    expect(card(cards, 'avgRank')).toMatchObject({ state: 'pending', reason: 'gsc' })
    // 抓取数据源已就绪，缺证据 = 本轮未采集，而非「功能未建」
    expect(card(cards, 'crawlableText')).toMatchObject({ state: 'pending', reason: 'uncollected' })
    expect(card(cards, 'schemaCoverage')).toMatchObject({ state: 'pending', reason: 'uncollected' })
  })

  it('derives real measured cards from SP2 evidence (render_check + schema)', () => {
    const cards = deriveStatCards(SP2_EVIDENCE)
    // 正文可抓取占比 = initial/rendered = 900/1000 = 90%
    expect(card(cards, 'crawlableText')).toEqual({ key: 'crawlableText', state: 'measured', value: '90', level: 'L4', evidenceId: 'ev_rc' })
    // 结构化数据类型数 = 2
    expect(card(cards, 'schemaCoverage')).toEqual({ key: 'schemaCoverage', state: 'measured', value: '2', level: 'L4', evidenceId: 'ev_sc' })
    // 搜索可见性 / AI 可见度 / 平均排名 无对应证据 → 待接入对应数据源
    expect(card(cards, 'indexVisibility')).toMatchObject({ state: 'pending', reason: 'search_provider' })
    expect(card(cards, 'aiVisibility')).toMatchObject({ state: 'pending', reason: 'ai_probe' })
    expect(card(cards, 'avgRank')).toMatchObject({ state: 'pending', reason: 'gsc' })
  })

  it('derives avgRank and a 0% crawlable from mixed run evidence', () => {
    const cards = deriveStatCards(MIXED_EVIDENCE)
    expect(card(cards, 'indexVisibility')).toEqual({ key: 'indexVisibility', state: 'measured', value: '12', level: 'L2', evidenceId: 'ev_serp' })
    expect(card(cards, 'avgRank')).toEqual({ key: 'avgRank', state: 'measured', value: '6.3', level: 'L2', evidenceId: 'ev_gsc' })
    // initial 0 / rendered 1840 → 0%（正文全靠 JS 渲染，AI 抓不到）
    expect(card(cards, 'crawlableText')).toEqual({ key: 'crawlableText', state: 'measured', value: '0', level: 'L4', evidenceId: 'ev_render' })
    // 没有 schema 证据 → 本轮未采集
    expect(card(cards, 'schemaCoverage')).toMatchObject({ state: 'pending', reason: 'uncollected' })
  })

  it('derives a measured aiVisibility card from the probe summary (L3, opens a representative answer)', () => {
    const cards = deriveStatCards([], {
      probe: {
        promptsTotal: 20,
        promptsPresent: 6,
        totalSamples: 100,
        perPrompt: [],
        sov: [],
        perEngine: [],
        sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 },
        sampleEvidenceId: 'ev_probe_hit',
      },
    })
    expect(card(cards, 'aiVisibility')).toEqual({
      key: 'aiVisibility',
      state: 'measured',
      value: '6',
      level: 'L3',
      evidenceId: 'ev_probe_hit',
    })
  })

  it('stays pending on ai_probe when the probe summary is null', () => {
    const cards = deriveStatCards([], { probe: null })
    expect(card(cards, 'aiVisibility')).toMatchObject({ state: 'pending', reason: 'ai_probe' })
  })

  // Cloudflare 未配置时缺 render_check 不是「本轮未采集」而是「渲染数据源未接入」——
  // 空态必须能区分，否则用户以为重跑一次就有数。
  it('reports render_provider (not uncollected) when Cloudflare is unconfigured and render evidence is missing', () => {
    const cards = deriveStatCards([], { sources: { renderProvider: false } })
    expect(card(cards, 'crawlableText')).toMatchObject({ state: 'pending', reason: 'render_provider' })
  })

  it('keeps uncollected when the render provider is configured but evidence is missing this run', () => {
    const cards = deriveStatCards([], { sources: { renderProvider: true } })
    expect(card(cards, 'crawlableText')).toMatchObject({ state: 'pending', reason: 'uncollected' })
  })

  it('clamps crawlable ratio to 100 when initial exceeds rendered', () => {
    const cards = deriveStatCards([
      { id: 'ev_x', type: 'render_check', claimLevel: 'L4', payload: { initialHtmlMainTextChars: 1200, renderedMainTextChars: 1000, mainContentDelta: -200 } },
    ])
    expect(card(cards, 'crawlableText')).toMatchObject({ state: 'measured', value: '100' })
  })
})
