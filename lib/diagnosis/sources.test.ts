import { describe, it, expect } from 'vitest'
import { availableSources, unmetRequirements, isProtocolBound } from './sources'

// 形状取自真实库 run_188896f4 的 data_source_statuses（10-06 体检）。
const realRows = [
  { sourceKey: 'ai_probe', status: 'collected', capturedEvidenceCount: 30 },
  { sourceKey: 'aio', status: 'partial', capturedEvidenceCount: 18 },
  { sourceKey: 'crawl', status: 'collected', capturedEvidenceCount: 21 },
  { sourceKey: 'dataforseo:labs', status: 'collected', capturedEvidenceCount: 1 },
  { sourceKey: 'dataforseo:seed_serp', status: 'collected', capturedEvidenceCount: 1 },
  { sourceKey: 'google_cse', status: 'not_configured', capturedEvidenceCount: 0 },
  { sourceKey: 'gsc', status: 'failed', capturedEvidenceCount: 0 },
  { sourceKey: 'psi', status: 'failed', capturedEvidenceCount: 0 },
  { sourceKey: 'render', status: 'partial', capturedEvidenceCount: 0 },
  { sourceKey: 'third_party:reddit', status: 'failed', capturedEvidenceCount: 0 },
  { sourceKey: 'third_party:wikipedia', status: 'collected', capturedEvidenceCount: 1 },
]

describe('availableSources', () => {
  const avail = availableSources(realRows, { confirmedCompetitorCount: 0 })

  it('collected 可用；failed / not_configured 不可用', () => {
    expect(avail.has('crawl')).toBe(true)
    expect(avail.has('gsc')).toBe(false)
    expect(avail.has('psi')).toBe(false)
  })

  it('partial 且采到证据才可用：render partial + 0 条不可用（Review Focus 1）', () => {
    expect(avail.has('render')).toBe(false)
  })

  it('没有状态行的数据源不可用（社媒没配置时连子键行都没有）', () => {
    expect(avail.has('social_presence:youtube')).toBe(false)
  })

  it('入口页恒可用；已确认竞品按数量判定', () => {
    expect(avail.has('entry')).toBe(true)
    expect(avail.has('confirmed_competitors')).toBe(false)
    expect(availableSources(realRows, { confirmedCompetitorCount: 2 }).has('confirmed_competitors')).toBe(true)
  })
})

describe('unmetRequirements', () => {
  const avail = availableSources(realRows, { confirmedCompetitorCount: 0 })
  it('全部满足 → 空', () => {
    expect(unmetRequirements(['crawl', 'entry'], avail)).toEqual([])
  })
  it('缺一个就列出来', () => {
    expect(unmetRequirements(['crawl', 'gsc'], avail)).toEqual(['gsc'])
  })
  it('任一组：组内有一个可用即满足，全不可用时整组列出', () => {
    expect(unmetRequirements([['gsc', 'dataforseo:seed_serp']], avail)).toEqual([])
    expect(unmetRequirements([['gsc', 'psi']], avail)).toEqual([['gsc', 'psi']])
  })
})

describe('isProtocolBound', () => {
  it('依赖 AI 探针、已确认竞品、种子词 SERP / Labs 的规则受协议约束；任一组不计', () => {
    expect(isProtocolBound(['ai_probe'])).toBe(true)
    expect(isProtocolBound(['dataforseo:seed_serp', 'confirmed_competitors'])).toBe(true)
    expect(isProtocolBound(['crawl'])).toBe(false)
    expect(isProtocolBound([['gsc', 'dataforseo:seed_serp']])).toBe(false)
  })
})
