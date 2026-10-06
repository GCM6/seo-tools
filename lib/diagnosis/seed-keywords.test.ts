import { describe, it, expect } from 'vitest'
import { gatherSeedKeywords } from './seed-keywords'

const base = { manualKeywords: [], gscQueries: [], historicalGsc: [], sitePhrases: [], brand: 'metadocu', aliases: [], limit: 100 }

describe('gatherSeedKeywords（SP-A §3.3）', () => {
  it('优先级 manual → 本期 gsc（按展示降序）→ 历史 gsc（按时间降序）→ 站点短语，带来源标签', () => {
    const seeds = gatherSeedKeywords({
      ...base,
      manualKeywords: ['remove pdf metadata'],
      gscQueries: [
        { keyText: 'remove author from word', impressions: 3 },
        { keyText: 'remove metadata excel', impressions: 9 },
      ],
      historicalGsc: [
        { keyText: 'old query', lastSeenAt: '2026-07-01T00:00:00.000Z' },
        { keyText: 'newer query', lastSeenAt: '2026-09-01T00:00:00.000Z' },
      ],
      sitePhrases: ['remove gps exif from document images'],
    })
    expect(seeds.map((s) => [s.text, s.source])).toEqual([
      ['remove pdf metadata', 'manual'],
      ['remove metadata excel', 'gsc'],
      ['remove author from word', 'gsc'],
      ['newer query', 'gsc_history'],
      ['old query', 'gsc_history'],
      ['remove gps exif from document images', 'site_phrase'],
    ])
    expect(seeds.find((s) => s.text === 'newer query')?.lastSeenAt).toBe('2026-09-01T00:00:00.000Z')
    expect(seeds.find((s) => s.text === 'remove pdf metadata')).not.toHaveProperty('lastSeenAt')
  })

  it('去品牌（含别名，忽略大小写与空白/符号）、去重（大小写/空白）、按 limit 截断', () => {
    const seeds = gatherSeedKeywords({
      ...base,
      aliases: ['Meta Docu'],
      manualKeywords: ['MetaDocu review', 'meta-docu pricing', 'Remove  PDF metadata'],
      gscQueries: [{ keyText: 'remove pdf metadata', impressions: 5 }],
      limit: 1,
    })
    expect(seeds).toEqual([{ text: 'Remove  PDF metadata', source: 'manual' }])
  })

  it('探针问句不再是种子来源：入参里根本没有 promptTexts', () => {
    // 类型层面保证；这里锁住全空输入 → 空数组（调用方据此标 no_seeds）。
    expect(gatherSeedKeywords(base)).toEqual([])
  })
})
