import { describe, it, expect } from 'vitest'
import { identifyCompetitors, PLATFORM_DOMAINS } from './competitor-identify'
import type { CompetitorCandidate } from './competitor-identify'
import type { SeedSerpEntry, SerpItem } from '@/lib/dataforseo/types'

// 构造一条 SERP item 的简写。
function item(domain: string, rank: number): SerpItem {
  return { domain, url: `https://${domain}/p${rank}`, rank, title: `${domain} ${rank}`, type: 'organic' }
}

// 构造一个种子词条目。
function seed(keyword: string, items: SerpItem[]): SeedSerpEntry {
  return { keyword, items }
}

describe('identifyCompetitors', () => {
  it('按 Search Overlap 降序识别竞品并计对（词数/加权位置分/overlap/topSharedKeywords）', () => {
    const serp: SeedSerpEntry[] = [
      seed('kw1', [item('own.com', 1), item('a.com', 2), item('b.com', 3)]),
      seed('kw2', [item('a.com', 1), item('b.com', 5)]),
      seed('kw3', [item('a.com', 4), item('c.com', 2)]),
      seed('kw4', [item('a.com', 3)]),
    ]
    const out = identifyCompetitors({ serp, ownDomain: 'own.com', topN: 10 })

    // a.com 出现在 4/4 词 → overlap 1；b 2/4=0.5；c 1/4=0.25。
    expect(out.map((c) => c.domain)).toEqual(['a.com', 'b.com', 'c.com'])
    const a = out[0]
    expect(a.overlapScore).toBe(1)
    expect(a.sharedKeywordsCount).toBe(4)
    expect(a.topSharedKeywords).toEqual(['kw1', 'kw2', 'kw3', 'kw4'])
    // 加权位置分 = 1/2 + 1/1 + 1/4 + 1/3 ≈ 2.0833
    expect(a.weightedPositionScore).toBeCloseTo(1 / 2 + 1 + 1 / 4 + 1 / 3, 6)
  })

  it('排除本站自身（含 www. 前缀归一）', () => {
    const serp: SeedSerpEntry[] = [
      seed('kw1', [item('www.own.com', 1), item('a.com', 2)]),
      seed('kw2', [item('OWN.com', 1), item('a.com', 2)]),
    ]
    const out = identifyCompetitors({ serp, ownDomain: 'own.com', topN: 10 })
    expect(out.map((c) => c.domain)).toEqual(['a.com'])
  })

  it('过滤平台/基础设施域（含 amazon 区域站），不进商业候选', () => {
    const serp: SeedSerpEntry[] = [
      seed('kw1', [
        item('wikipedia.org', 1),
        item('youtube.com', 2),
        item('amazon.co.uk', 3),
        item('reddit.com', 4),
        item('realcompetitor.com', 5),
      ]),
    ]
    const out = identifyCompetitors({ serp, ownDomain: 'own.com', topN: 10 })
    expect(out.map((c) => c.domain)).toEqual(['realcompetitor.com'])
    for (const c of out) expect(PLATFORM_DOMAINS).not.toContain(c.domain)
  })

  it('同一词内域名重复：overlap 计一次，加权位置分累加每次出现', () => {
    const serp: SeedSerpEntry[] = [
      seed('kw1', [item('a.com', 1), item('a.com', 4)]),
    ]
    const out = identifyCompetitors({ serp, ownDomain: 'own.com', topN: 10 })
    expect(out[0].sharedKeywordsCount).toBe(1)
    expect(out[0].overlapScore).toBe(1)
    expect(out[0].weightedPositionScore).toBeCloseTo(1 + 1 / 4, 6)
  })

  it('topSharedKeywords 上限 5', () => {
    const serp: SeedSerpEntry[] = Array.from({ length: 7 }, (_, i) =>
      seed(`kw${i}`, [item('a.com', 1)]),
    )
    const out = identifyCompetitors({ serp, ownDomain: 'own.com', topN: 10 })
    expect(out[0].topSharedKeywords).toHaveLength(5)
    expect(out[0].topSharedKeywords).toEqual(['kw0', 'kw1', 'kw2', 'kw3', 'kw4'])
  })

  it('topN 截断，同 overlap 用加权位置分降序打破平手', () => {
    const serp: SeedSerpEntry[] = [
      seed('kw1', [item('a.com', 5), item('b.com', 1), item('c.com', 9)]),
    ]
    const out = identifyCompetitors({ serp, ownDomain: 'own.com', topN: 2 })
    // 三者 overlap 均 1；加权位置分 b(1) > a(0.2) > c(0.111)，取前 2 = b,a
    expect(out.map((c) => c.domain)).toEqual(['b.com', 'a.com'])
  })

  it('边界：空 serp 返回空；topN<=0 返回空', () => {
    expect(identifyCompetitors({ serp: [], ownDomain: 'own.com', topN: 10 })).toEqual([])
    const serp: SeedSerpEntry[] = [seed('kw1', [item('a.com', 1)])]
    expect(identifyCompetitors({ serp, ownDomain: 'own.com', topN: 0 })).toEqual([])
  })

  it('边界：全为平台域/本站 → 无候选', () => {
    const serp: SeedSerpEntry[] = [
      seed('kw1', [item('own.com', 1), item('wikipedia.org', 2), item('amazon.de', 3)]),
    ]
    expect(identifyCompetitors({ serp, ownDomain: 'own.com', topN: 10 })).toEqual<CompetitorCandidate[]>([])
  })
})
