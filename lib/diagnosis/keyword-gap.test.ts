import { describe, it, expect } from 'vitest'
import { computeKeywordGaps } from './keyword-gap'
import type { KeywordGapResult } from './keyword-gap'
import type { SeedSerpEntry, SerpItem, LabsKeywordDatum } from '@/lib/dataforseo/types'

function item(domain: string, rank: number): SerpItem {
  return { domain, url: `https://${domain}/p${rank}`, rank, title: `${domain} ${rank}`, type: 'organic' }
}
function seed(keyword: string, items: SerpItem[]): SeedSerpEntry {
  return { keyword, items }
}
function labs(over: Partial<LabsKeywordDatum> & { keyword: string }): LabsKeywordDatum {
  return { searchVolume: null, difficulty: null, cpc: null, intent: null, ...over }
}

describe('关键词缺口按自然排名判断首页（验收新发现 3）', () => {
  it('官网自然第 8、绝对位置 11（前面有 AI Overview / PAA 等模块）→ winning，不是"未进前 10"', () => {
    const own: SerpItem = { ...item('example.com', 11), rankGroup: 8 }
    const gaps = computeKeywordGaps({ serp: [seed('kw', [own, { ...item('rival.com', 3), rankGroup: 1 }])], ownDomain: 'example.com', confirmedCompetitorDomains: ['rival.com'] })
    expect(gaps[0]).toMatchObject({ gapType: 'winning', ourPosition: 8 })
  })
  it('官网只以广告出现 → 不算排名（两个竞品在前 10 → missing）', () => {
    const ad: SerpItem = { domain: 'example.com', url: 'https://example.com/lp', rank: 1, rankGroup: 1, title: 'ad', type: 'paid' }
    const gaps = computeKeywordGaps({
      serp: [seed('kw', [ad, { ...item('rival.com', 2), rankGroup: 1 }, { ...item('other.com', 3), rankGroup: 2 }])],
      ownDomain: 'example.com', confirmedCompetitorDomains: ['rival.com', 'other.com'],
    })
    expect(gaps[0]).toMatchObject({ gapType: 'missing', ourPosition: null })
  })
})

describe('computeKeywordGaps', () => {
  it('missing：本站无排名 且 ≥2 竞品 Top10', () => {
    const serp: SeedSerpEntry[] = [
      seed('gap1', [item('c1.com', 2), item('c2.com', 5), item('other.com', 8)]),
    ]
    const out = computeKeywordGaps({
      serp,
      ownDomain: 'own.com',
      confirmedCompetitorDomains: ['c1.com', 'c2.com'],
    })
    expect(out).toHaveLength(1)
    expect(out[0].gapType).toBe('missing')
    expect(out[0].ourPosition).toBeNull()
    expect(out[0].competitorPositions).toEqual([
      { domain: 'c1.com', position: 2 },
      { domain: 'c2.com', position: 5 },
    ])
  })

  it('本站无排名但仅 1 竞品 Top10 → 不算 missing，剔除', () => {
    const serp: SeedSerpEntry[] = [seed('x', [item('c1.com', 2), item('other.com', 4)])]
    const out = computeKeywordGaps({
      serp,
      ownDomain: 'own.com',
      confirmedCompetitorDomains: ['c1.com', 'c2.com'],
    })
    expect(out).toEqual<KeywordGapResult[]>([])
  })

  it('weak：本站 11-30 名 且 ≥1 竞品 Top10', () => {
    const serp: SeedSerpEntry[] = [
      seed('w1', [item('c1.com', 3), item('own.com', 15)]),
    ]
    const out = computeKeywordGaps({
      serp,
      ownDomain: 'own.com',
      confirmedCompetitorDomains: ['c1.com'],
    })
    expect(out[0].gapType).toBe('weak')
    expect(out[0].ourPosition).toBe(15)
  })

  it('本站 >30 名 → 不算 weak，剔除', () => {
    const serp: SeedSerpEntry[] = [seed('w', [item('c1.com', 3), item('own.com', 35)])]
    const out = computeKeywordGaps({
      serp,
      ownDomain: 'own.com',
      confirmedCompetitorDomains: ['c1.com'],
    })
    expect(out).toEqual([])
  })

  it('winning：本站 Top10，记录并标出', () => {
    const serp: SeedSerpEntry[] = [
      seed('win1', [item('own.com', 4), item('c1.com', 2)]),
    ]
    const out = computeKeywordGaps({
      serp,
      ownDomain: 'own.com',
      confirmedCompetitorDomains: ['c1.com'],
    })
    expect(out[0].gapType).toBe('winning')
    expect(out[0].ourPosition).toBe(4)
  })

  it('opportunityScore：高量+商业意图+低难度 显著高于 低量+信息意图+高难度，并按分降序', () => {
    const serp: SeedSerpEntry[] = [
      seed('hot', [item('c1.com', 1), item('c2.com', 2)]),
      seed('cold', [item('c1.com', 1), item('c2.com', 2)]),
    ]
    const keywordData: LabsKeywordDatum[] = [
      labs({ keyword: 'hot', searchVolume: 50000, difficulty: 10, intent: 'transactional' }),
      labs({ keyword: 'cold', searchVolume: 50, difficulty: 90, intent: 'informational' }),
    ]
    const out = computeKeywordGaps({
      serp,
      ownDomain: 'own.com',
      confirmedCompetitorDomains: ['c1.com', 'c2.com'],
      keywordData,
    })
    expect(out.map((r) => r.keyword)).toEqual(['hot', 'cold'])
    expect(out[0].opportunityScore).toBeGreaterThan(out[1].opportunityScore)
    expect(out[0].searchVolume).toBe(50000)
    // 0-100 归一
    for (const r of out) {
      expect(r.opportunityScore).toBeGreaterThanOrEqual(0)
      expect(r.opportunityScore).toBeLessThanOrEqual(100)
    }
  })

  it('搜索量缺失 → opportunityScore 归 0（乘性沉底），searchVolume=null', () => {
    const serp: SeedSerpEntry[] = [seed('novol', [item('c1.com', 1), item('c2.com', 2)])]
    const out = computeKeywordGaps({
      serp,
      ownDomain: 'own.com',
      confirmedCompetitorDomains: ['c1.com', 'c2.com'],
      keywordData: [labs({ keyword: 'novol', difficulty: 5, intent: 'transactional' })],
    })
    expect(out[0].opportunityScore).toBe(0)
    expect(out[0].searchVolume).toBeNull()
  })

  it('域名归一：www./大小写 一致对齐', () => {
    const serp: SeedSerpEntry[] = [
      seed('k', [item('www.C1.com', 2), item('c2.com', 3)]),
    ]
    const out = computeKeywordGaps({
      serp,
      ownDomain: 'own.com',
      confirmedCompetitorDomains: ['C1.com', 'WWW.c2.com'],
    })
    expect(out[0].gapType).toBe('missing')
    expect(out[0].competitorPositions.map((c) => c.domain)).toEqual(['c1.com', 'c2.com'])
  })

  it('边界：空 serp / 无确认竞品 / 全 winning', () => {
    expect(computeKeywordGaps({ serp: [], ownDomain: 'own.com', confirmedCompetitorDomains: [] })).toEqual([])

    // 无确认竞品 → 无 missing/weak；本站 Top10 仍可 winning
    const serp: SeedSerpEntry[] = [
      seed('a', [item('own.com', 3)]),
      seed('b', [item('own.com', 1)]),
    ]
    const out = computeKeywordGaps({ serp, ownDomain: 'own.com', confirmedCompetitorDomains: [] })
    expect(out.every((r) => r.gapType === 'winning')).toBe(true)
    expect(out).toHaveLength(2)
  })
})

describe('ownDomain 归一（SP-A §5.2 #7：输入是 normalizeDomain 的真实输出）', () => {
  it('项目域名带协议与结尾斜杠，本站在 SERP 第 1 名 → winning，而不是 missing', async () => {
    const { normalizeDomain } = await import('@/lib/analysis/normalize-domain')
    const ownDomain = normalizeDomain('metadocu.com')!
    expect(ownDomain).toMatch(/^https?:\/\//) // 前提：真实生产者确实带协议
    const out = computeKeywordGaps({
      serp: [seed('remove pdf metadata', [item('metadocu.com', 1), item('c1.com', 3), item('c2.com', 5)])],
      ownDomain,
      confirmedCompetitorDomains: ['c1.com', 'c2.com'],
    })
    expect(out).toHaveLength(1)
    expect(out[0].gapType).toBe('winning')
    expect(out[0].ourPosition).toBe(1)
  })
})
