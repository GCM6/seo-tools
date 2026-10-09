import { describe, it, expect } from 'vitest'
import { toFindingDetail, NO_DETAIL_RULES, EXTRACTED_RULES } from './finding-detail'
import { allRules } from './rules'

const hit = (ruleId: string, detail: Record<string, unknown>, scope = 'site') => ({ ruleId, scope, detail })

describe('toFindingDetail', () => {
  it('87 条规则要么有提取器、要么明确列为没有明细，不重不漏', () => {
    const ids = allRules.map((r) => r.id).sort()
    expect([...EXTRACTED_RULES, ...NO_DETAIL_RULES].sort()).toEqual(ids)
  })

  it('T04：页面 + canonical 现值', () => {
    expect(toFindingDetail(hit('T04', { count: 1, examples: [{ url: 'https://a.com/x', canonical: 'https://b.com/x' }] }))).toEqual({
      scale: { affected: 1 },
      rows: [{ url: 'https://a.com/x', field: 'canonical', current: 'https://b.com/x', expected: null }],
      truncated: false,
    })
  })

  it('L02：改的是来源页的链接，应改为跳转后的最终地址', () => {
    const d = toFindingDetail(hit('L02', {
      count: 1, links: 2,
      examples: [{ url: 'https://a.com/old', finalUrl: 'https://a.com/new', sourceCount: 2, sources: [{ from: 'https://a.com/p1', anchor: 'x', regions: ['main'], linkedAs: '/old' }, { from: 'https://a.com/p2', anchor: 'y', regions: ['footer'] }] }],
    }))
    expect(d?.rows).toEqual([
      { url: 'https://a.com/p1', field: '链接 href', current: '/old', expected: 'https://a.com/new' },
      { url: 'https://a.com/p2', field: '链接 href', current: 'https://a.com/old', expected: 'https://a.com/new' },
    ])
  })

  it('C05c：每个缺失字段一行，超过 20 行截断并标记', () => {
    const examples = Array.from({ length: 11 }, (_, i) => ({ url: `https://a.com/p${i}`, type: 'Product', missing: ['offers', 'review'] }))
    const d = toFindingDetail(hit('C05c', { examples, total: 11, vocabVersion: 'v1' }, 'schema:required'))
    expect(d?.rows).toHaveLength(20)
    expect(d?.truncated).toBe(true)
    expect(d?.rows[0]).toEqual({ url: 'https://a.com/p0', field: 'Product.offers', current: '缺失', expected: null })
    expect(d?.scale).toEqual({ affected: 11 })
  })

  it('入口页规则：scope 是绝对 URL 时作为页面，否则页面为空', () => {
    expect(toFindingDetail(hit('C03', { h1Count: 2, h1Texts: ['A', 'B'] }, 'https://a.com/'))?.rows[0]).toEqual({ url: 'https://a.com/', field: 'H1', current: 'A | B', expected: '每页唯一 H1' })
    expect(toFindingDetail(hit('C03', { h1Count: 0 }, 'entry'))?.rows[0].url).toBeNull()
  })

  it('关键词类：没有页面，字段写关键词', () => {
    expect(toFindingDetail(hit('K03', { keywords: [{ text: 'remove pdf metadata', searchVolume: 500, opportunityScore: 3, ourPosition: null }] }, 'keywords:gap-missing'))?.rows[0]).toEqual({
      url: null, field: '关键词：remove pdf metadata', current: '未排名', expected: null,
    })
  })

  it('AR01：受影响 / 总数来自缺失数与文章数', () => {
    expect(toFindingDetail(hit('AR01', { articleCount: 5, missingCount: 3, share: 0.6, sampleUrls: ['https://a.com/b1'] }))).toEqual({
      scale: { affected: 3, total: 5 },
      rows: [{ url: 'https://a.com/b1', field: '作者署名', current: '缺失', expected: null }],
      truncated: false,
    })
  })

  it('C10：规则每组最多带 5 个 URL，现在列不写推算出来的重复页数', () => {
    // 规则（content.ts）对每组做 urls.slice(0, 5)，12 页的重复组也只带 5 个 URL；duplicatePageCount 是全量。
    const urls = Array.from({ length: 5 }, (_, i) => `https://a.com/dup${i}`)
    const d = toFindingDetail(hit('C10', { duplicateGroups: 1, duplicatePageCount: 12, examples: [{ hash: 'h1', urls }] }, 'content:duplicate'))
    expect(d?.scale).toEqual({ affected: 12 })
    expect(d?.rows).toEqual(urls.map((url) => ({ url, field: '正文', current: '与同组其他页正文完全相同', expected: null })))
    expect(d?.truncated).toBe(false)
  })

  it('没有明细的规则 → null；detail 缺失或形状不符 → 不抛错', () => {
    expect(toFindingDetail(hit('G05', { present: 0, total: 23 }))).toBeNull()
    expect(toFindingDetail({ ruleId: 'T04', scope: 'site', detail: undefined })).toEqual({ scale: { affected: null }, rows: [], truncated: false })
    expect(toFindingDetail(hit('L01', { examples: 'oops' }))).toEqual({ scale: { affected: null }, rows: [], truncated: false })
  })
})
