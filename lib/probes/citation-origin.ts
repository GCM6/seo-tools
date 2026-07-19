// 引用来源归属分类（GEO 探针引用口径修复 ⑤）：把一条引用 URL 分类为「自有域名」还是
// 「第三方」，供 summary.ts 聚合被引用域名分布展示。
//
// 铁律：只做二分类（owned / third_party），不做 competitor 归属——项目配置里竞品只有品牌名，
// 没有域名（db/schema.ts projects.competitors 是 string[] 名称），任何「这条 URL 属于某竞品」
// 的猜测映射都是无证据支撑的臆断，违反本项目「不产出无证据结论」的铁律（CLAUDE.md 核心原则）。
//
// 域名匹配复用 parse.ts 的 hostMatchesDomain（唯一实现），不重复一套子域名判定逻辑。

import { hostMatchesDomain } from './parse'

export type CitationOrigin = 'owned' | 'third_party'

// owned = URL 的 host 等于目标域名或其子域；解析失败的 URL（畸形 URL）保守归为 third_party
// （不产出无证据结论——URL 都解析不出来源，更谈不上断言它是"自有"）。
export function classifyCitationOrigin(url: string, targetDomain: string): CitationOrigin {
  try {
    const host = new URL(url).hostname
    return hostMatchesDomain(host, targetDomain) ? 'owned' : 'third_party'
  } catch {
    return 'third_party'
  }
}
