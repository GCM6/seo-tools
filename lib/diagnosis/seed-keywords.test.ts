import { describe, it, expect } from 'vitest'
import { gatherSeedKeywords } from './seed-keywords'

describe('gatherSeedKeywords', () => {
  it('GSC 词按展示量降序在前，探针词补后，去重截断', () => {
    const out = gatherSeedKeywords({
      gscQueries: [
        { keyText: 'cheap widgets', impressions: 10 },
        { keyText: 'best widgets', impressions: 100 },
      ],
      promptTexts: ['widget reviews', 'best widgets'], // 'best widgets' 与 GSC 重复
      brand: 'acme',
      limit: 10,
    })
    expect(out).toEqual(['best widgets', 'cheap widgets', 'widget reviews'])
  })

  it('去品牌导航词（归一后包含品牌串即剔除）', () => {
    const out = gatherSeedKeywords({
      gscQueries: [
        { keyText: 'Acme login', impressions: 50 },
        { keyText: 'widget guide', impressions: 20 },
      ],
      promptTexts: ['acme pricing', 'how to choose widgets'],
      brand: 'Acme',
      limit: 10,
    })
    expect(out).toEqual(['widget guide', 'how to choose widgets'])
  })

  it('空品牌不过滤；limit 截断', () => {
    const out = gatherSeedKeywords({
      gscQueries: [
        { keyText: 'a', impressions: 3 },
        { keyText: 'b', impressions: 2 },
        { keyText: 'c', impressions: 1 },
      ],
      promptTexts: [],
      brand: '',
      limit: 2,
    })
    expect(out).toEqual(['a', 'b'])
  })

  it('大小写/空白归一去重', () => {
    const out = gatherSeedKeywords({
      gscQueries: [{ keyText: '  Best   Widgets ', impressions: 5 }],
      promptTexts: ['best widgets'],
      brand: 'x',
      limit: 10,
    })
    expect(out).toEqual(['Best   Widgets'])
  })
})
