import { describe, it, expect } from 'vitest'
import { organicPosition } from './serp-position'

// 自然排名口径（验收新发现 3）：本轮 23 个真实 SERP 里自然结果的 rank_absolute 比 rank_group 中位多 2、最多 3
// （AI Overview / PAA / 视频等模块也占名次），判"首页前 10"必须用自然名次。
describe('organicPosition', () => {
  it('自然结果取 rank_group（自然结果内的名次），不是含模块的绝对位置', () => {
    expect(organicPosition({ type: 'organic', rank: 11, rankGroup: 8 })).toBe(8)
  })
  it('精选摘要算第 1 位（谷歌会把它的网址从下方自然结果里去重）', () => {
    expect(organicPosition({ type: 'featured_snippet', rank: 2, rankGroup: 1 })).toBe(1)
  })
  it('广告、本地服务、股票框等模块不是排名 → null', () => {
    for (const type of ['paid', 'local_services', 'stocks_box', 'shopping']) expect(organicPosition({ type, rank: 1, rankGroup: 1 }), type).toBeNull()
  })
  it('旧证据没有 rankGroup → 退回 rank；没有 type 的旧品牌词条目按自然结果处理', () => {
    expect(organicPosition({ type: 'organic', rank: 5 })).toBe(5)
    expect(organicPosition({ rank: 3 })).toBe(3)
  })
  it('名次非正数 → null（非法数据不进排名比较）', () => {
    expect(organicPosition({ type: 'organic', rank: 0, rankGroup: 0 })).toBeNull()
  })
})
