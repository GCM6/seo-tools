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

  // 缺陷修复（2026-07-13 GEO branded/unbranded 重设计后审查）：aiVisibility 头条卡此前消费全集
  // promptsPresent/promptsTotal，把品牌提问里模型复述问题文本自带品牌名的命中也计入「AI 可见度」，
  // 与同屏 PresenceMap／报告 GEO 段的 unbranded 口径矛盾（例如「AI 可见度 7」vs「无品牌召回 0/23」）。
  // 现在必须只消费 probe.unbranded.present/total。
  it('derives a measured aiVisibility card from probe.unbranded (L3), not the full-set promptsPresent/promptsTotal', () => {
    const cards = deriveStatCards([], {
      probe: {
        promptsTotal: 30,
        // promptsPresent 故意远高于 unbranded.present：7 条命中来自品牌提问的复述，
        // 若卡片仍读这个全集字段就会显示误导性的「13」而不是「6」。
        promptsPresent: 13,
        totalSamples: 100,
        perPrompt: [],
        sov: [],
        perEngine: [],
        sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 },
        sampleEvidenceId: 'ev_probe_hit',
        // 头条指标应严格等于这里的 unbranded 子集，而非上面的全集 promptsPresent/promptsTotal。
        unbranded: { present: 6, total: 23, wilsonLow: 0.18 },
        branded: { perEngine: [] },
        citationRate: 0,
      },
    })
    expect(card(cards, 'aiVisibility')).toEqual({
      key: 'aiVisibility',
      state: 'measured',
      value: '6/23',
      level: 'L3',
      evidenceId: 'ev_probe_hit',
    })
  })

  // unbranded.total === 0：探针跑过（有代表性证据）但无可评估的无品牌提问子集——不能显示 0/0，
  // 那会被误读成「0 命中」而不是「这个指标本轮不可评估」。
  it('falls back to a dash when the unbranded subset is empty, instead of showing 0/0', () => {
    const cards = deriveStatCards([], {
      probe: {
        promptsTotal: 20,
        promptsPresent: 4,
        totalSamples: 20,
        perPrompt: [],
        sov: [],
        perEngine: [],
        sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 },
        sampleEvidenceId: 'ev_probe_hit',
        unbranded: { present: 0, total: 0, wilsonLow: 0 },
        branded: { perEngine: [] },
        citationRate: 0,
      },
    })
    expect(card(cards, 'aiVisibility')).toEqual({
      key: 'aiVisibility',
      state: 'measured',
      value: '—',
      level: 'L3',
      evidenceId: 'ev_probe_hit',
    })
  })

  it('stays pending on ai_probe when the probe summary is null', () => {
    const cards = deriveStatCards([], { probe: null })
    expect(card(cards, 'aiVisibility')).toMatchObject({ state: 'pending', reason: 'ai_probe' })
  })

  // 浏览器渲染未配置时，基础 HTML 抓取仍会跑；空态必须标为「降级采集」，
  // 否则用户会以为重跑一次即可得到 JS 渲染差异。
  it('reports render_fallback (not uncollected) when browser rendering is unavailable', () => {
    const cards = deriveStatCards([], { sources: { renderProvider: false, renderStaticFallback: true } })
    expect(card(cards, 'crawlableText')).toMatchObject({ state: 'pending', reason: 'render_fallback' })
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

const gscEv = (id: string, payload: unknown): EvidenceLike => ({ id, type: 'gsc', claimLevel: 'L4', payload })

describe('deriveAvgRank', () => {
  it('gsc 证据带 avgPosition → measured L4', () => {
    const cards = deriveStatCards([gscEv('ev1', { dimension: 'query', rows: [], avgPosition: 4.2 })])
    const avg = cards.find((c) => c.key === 'avgRank')!
    expect(avg.state).toBe('measured')
    expect(avg).toMatchObject({ state: 'measured', value: '4.2', level: 'L4', evidenceId: 'ev1' })
  })
  it('多条 gsc 证据时择带 avgPosition 的那条（queryPage 无 avgPosition）', () => {
    const cards = deriveStatCards([
      gscEv('evQP', { dimension: 'queryPage', rows: [] }),
      gscEv('evQ', { dimension: 'query', rows: [], avgPosition: 3 }),
    ])
    expect(cards.find((c) => c.key === 'avgRank')).toMatchObject({ state: 'measured', evidenceId: 'evQ' })
  })
  it('无 gsc / 无 avgPosition → pending', () => {
    expect(deriveStatCards([]).find((c) => c.key === 'avgRank')).toEqual({ key: 'avgRank', state: 'pending', reason: 'gsc' })
    expect(deriveStatCards([gscEv('e', { dimension: 'query', rows: [] })]).find((c) => c.key === 'avgRank'))
      .toEqual({ key: 'avgRank', state: 'pending', reason: 'gsc' })
  })
})
