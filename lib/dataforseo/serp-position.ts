// 自然排名口径（验收新发现 3）：DataForSEO 的 rank_absolute 把 AI Overview、PAA、视频、广告等模块都算作名次，
// 2026-10-06 metadocu 实跑的 23 个真实 SERP 里，自然结果的 rank_absolute 比 rank_group 中位多 2、最多 3——
// 用它判"首页前 10"会系统性判严。所有"排名"比较统一经过这里：
//   - 自然结果（organic）取 rank_group（自然结果内的名次）；旧证据没有 rank_group 时退回 rank；
//   - 精选摘要（featured_snippet）算第 1 位：谷歌会把它的网址从下方自然结果里去重，不算会把占据精选摘要的站判成缺席；
//   - 广告、本地服务、购物等其它模块不是排名（null）；
//   - 没有 type 的旧品牌词条目按自然结果处理（沿用旧口径）。
export function organicPosition(item: { type?: string | null; rank: number; rankGroup?: number | null }): number | null {
  const type = item.type ?? 'organic'
  if (type === 'featured_snippet') return 1
  if (type !== 'organic') return null
  const position = item.rankGroup ?? item.rank
  return typeof position === 'number' && position > 0 ? position : null
}
