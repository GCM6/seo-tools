import { describe, it, expect } from 'vitest'
import {
  composeRecommendation,
  countRecFilters,
  groupByPriority,
  normalizePriority,
  rankRecs,
  recFilterOf,
  shortLevel,
  splitRecommendation,
} from './recommendations'

describe('splitRecommendation / composeRecommendation', () => {
  const what = '移除重点页 noindex\n\n参考修复示例（静态模板，非生成内容）：\n<meta name="robots" content="index,follow" />'

  it('拆出动作句与修复示例，示例不进标题', () => {
    expect(splitRecommendation(what)).toEqual({
      action: '移除重点页 noindex',
      fixSnippet: '<meta name="robots" content="index,follow" />',
    })
  })

  it('没有修复示例时整句都是动作', () => {
    expect(splitRecommendation('补齐 sitemap')).toEqual({ action: '补齐 sitemap', fixSnippet: '' })
  })

  it('改标题后把示例原样接回，再拆一次结果一致', () => {
    const { fixSnippet } = splitRecommendation(what)
    const edited = composeRecommendation('只对标签页保留 noindex', fixSnippet)
    expect(splitRecommendation(edited)).toEqual({ action: '只对标签页保留 noindex', fixSnippet })
    expect(composeRecommendation('补齐 sitemap', '')).toBe('补齐 sitemap')
  })
})

describe('shortLevel', () => {
  it.each([
    ['高（error 级，影响约 2 页/模板），修复对该支柱得分与可见性影响显著', '高'],
    ['中低（warning 级），修复为增量改善', '中低'],
    ['低', '低'],
    ['High (error level) — fixing it matters', 'High'],
  ])('%s → %s', (input, expected) => {
    expect(shortLevel(input)).toBe(expected)
  })

  it('取不到短级别时返回 null，不截半句', () => {
    expect(shortLevel('修复后预计显著提升收录')).toBeNull()
    expect(shortLevel('')).toBeNull()
    expect(shortLevel(undefined)).toBeNull()
  })
})

describe('筛选口径', () => {
  it('已编辑归入已接受，未知状态按待确认', () => {
    expect(['draft', 'accepted', 'edited', 'rejected', 'weird'].map(recFilterOf)).toEqual([
      'pending',
      'accepted',
      'accepted',
      'rejected',
      'pending',
    ])
  })

  it('计数与总数一致', () => {
    expect(countRecFilters(['draft', 'accepted', 'edited', 'rejected', 'draft'])).toEqual({
      all: 5,
      pending: 2,
      accepted: 2,
      rejected: 1,
    })
  })
})

describe('分组与排序', () => {
  it('按优先级固定顺序分组，未知优先级归入顺手补齐，空组省略', () => {
    const groups = groupByPriority([
      { id: 'a', priority: 'low' },
      { id: 'b', priority: 'quick_win' },
      { id: 'c', priority: 'P1' },
    ])
    expect(groups.map((g) => [g.priority, g.items.map((i) => i.id)])).toEqual([
      ['quick_win', ['b']],
      ['fill_in', ['c']],
      ['low', ['a']],
    ])
    expect(normalizePriority('P1')).toBe('fill_in')
  })

  it('组内按严重度、证据强度排序，缺 finding 的排最后，同级保持原顺序', () => {
    const ranked = rankRecs([
      { id: 'none' },
      { id: 'ok-hard', severity: 'ok', grade: 'hard' as const },
      { id: 'mid-inferred', severity: 'mid', grade: 'inferred' as const },
      { id: 'mid-hard', severity: 'mid', grade: 'hard' as const },
      { id: 'high', severity: 'high', grade: 'sample' as const },
      { id: 'mid-hard-2', severity: 'mid', grade: 'hard' as const },
    ])
    expect(ranked.map((r) => r.id)).toEqual(['high', 'mid-hard', 'mid-hard-2', 'mid-inferred', 'ok-hard', 'none'])
  })
})
