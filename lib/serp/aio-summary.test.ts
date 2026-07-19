import { describe, it, expect } from 'vitest'
import { aggregateAioExposure } from './aio-summary'

describe('aggregateAioExposure', () => {
  it('无结果（未采集/未配置）：全零 summary，不返回 null', () => {
    const summary = aggregateAioExposure({ totalQueries: 0, results: [], domain: 'example.com' })
    expect(summary).toEqual({
      totalQueries: 0,
      measuredQueries: 0,
      aioPresentCount: 0,
      ownedCitedCount: 0,
      citedDomains: [],
      perQuery: [],
    })
  })

  it('totalQueries 独立于 results.length（部分查询失败未落 results 行）', () => {
    const summary = aggregateAioExposure({
      totalQueries: 30,
      results: [{ keyword: 'a', aioPresent: true, targetDomainCited: false, citedUrls: [] }],
      domain: 'example.com',
    })
    expect(summary.totalQueries).toBe(30)
    expect(summary.measuredQueries).toBe(1)
  })

  it('aioPresentCount / ownedCitedCount 按行统计', () => {
    const summary = aggregateAioExposure({
      totalQueries: 3,
      results: [
        { keyword: 'q1', aioPresent: true, targetDomainCited: true, citedUrls: ['https://example.com/a'] },
        { keyword: 'q2', aioPresent: true, targetDomainCited: false, citedUrls: ['https://other.com/b'] },
        { keyword: 'q3', aioPresent: false, targetDomainCited: false, citedUrls: [] },
      ],
      domain: 'example.com',
    })
    expect(summary.aioPresentCount).toBe(2)
    expect(summary.ownedCitedCount).toBe(1)
  })

  it('citedDomains 按 host 聚合计数，origin 用 classifyCitationOrigin 判定 owned/third_party', () => {
    const summary = aggregateAioExposure({
      totalQueries: 2,
      results: [
        { keyword: 'q1', aioPresent: true, targetDomainCited: true, citedUrls: ['https://www.example.com/a', 'https://other.com/x'] },
        { keyword: 'q2', aioPresent: true, targetDomainCited: false, citedUrls: ['https://other.com/y'] },
      ],
      domain: 'example.com',
    })
    const byDomain = Object.fromEntries(summary.citedDomains.map((d) => [d.domain, d]))
    // www. 前缀被归一化去除，与 example.com 计入同一条
    expect(byDomain['example.com']).toEqual({ domain: 'example.com', count: 1, origin: 'owned' })
    expect(byDomain['other.com']).toEqual({ domain: 'other.com', count: 2, origin: 'third_party' })
    // 按 count 降序排列
    expect(summary.citedDomains[0].domain).toBe('other.com')
  })

  it('citedDomains 忽略畸形 URL，不抛错', () => {
    const summary = aggregateAioExposure({
      totalQueries: 1,
      results: [{ keyword: 'q1', aioPresent: true, targetDomainCited: false, citedUrls: ['not a url'] }],
      domain: 'example.com',
    })
    expect(summary.citedDomains).toEqual([])
  })

  it('perQuery 按 query/aioPresent/ownedCited/citedUrls 原样映射', () => {
    const summary = aggregateAioExposure({
      totalQueries: 1,
      results: [{ keyword: 'best crm', aioPresent: true, targetDomainCited: true, citedUrls: ['https://example.com/a'] }],
      domain: 'example.com',
    })
    expect(summary.perQuery).toEqual([
      { query: 'best crm', aioPresent: true, ownedCited: true, citedUrls: ['https://example.com/a'] },
    ])
  })
})
