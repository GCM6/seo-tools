// 引用平台分类：把一条被引用 URL 归入已知的社区/UGC 或参考类平台，供 summary.ts 聚合
// 「平台分类」维度与 ugcCitationShare 指标消费。
//
// 铁律（同 citation-origin.ts 头注）：只做「精确域名清单匹配」，不做任何模糊/启发式猜测
// （如按 URL 路径关键词、页面标题猜平台）——项目铁律是「不产出无证据支撑的结论」，域名
// 匹配不上就是 'other'，不强行归类。下表是人工维护的精确清单，新增平台需人工确认域名后
// 显式加进表里，不接受正则/子串猜测式扩表。
//
// 域名匹配复用 parse.ts 的 hostMatchesDomain（唯一实现：精确匹配或子域匹配），不重复一套
// 判定逻辑（同 citation-origin.ts 的复用先例）。

import { hostMatchesDomain } from './parse'

export type CitationPlatform =
  | 'reddit'
  | 'youtube'
  | 'linkedin'
  | 'quora'
  | 'wikipedia'
  | 'github'
  | 'other'

// 平台 → 根域名清单（人工维护）。同一平台的多个独立根域名（如短链域名）需逐一列出——
// hostMatchesDomain 只做「等于或子域」判定，不会替你把 youtu.be 关联到 youtube.com。
// wikipedia.org / github.com / linkedin.com / reddit.com / quora.com 的多语言/子站子域名
// （如 en.wikipedia.org、gist.github.com、old.reddit.com）天然被子域匹配覆盖，不必逐个列出。
const PLATFORM_DOMAINS: Record<Exclude<CitationPlatform, 'other'>, readonly string[]> = {
  reddit: ['reddit.com', 'redd.it'],
  youtube: ['youtube.com', 'youtu.be'],
  linkedin: ['linkedin.com'],
  quora: ['quora.com'],
  wikipedia: ['wikipedia.org'],
  github: ['github.com'],
}

// 接受完整 URL 或裸 host。是 URL 就解析取 hostname；不是（或解析失败）就当作已经是 host
// 原样使用——调用方（summary.ts）在域名分布聚合循环里已经手动解析过 host，无需重复 new URL()。
function extractHost(urlOrHost: string): string {
  try {
    return new URL(urlOrHost).hostname
  } catch {
    return urlOrHost
  }
}

// 畸形/无法识别的输入一律兜底 'other'（不产出无证据结论——认不出域名就不该断言它是某平台）。
export function classifyCitationPlatform(urlOrHost: string): CitationPlatform {
  const host = extractHost(urlOrHost)
  for (const [platform, domains] of Object.entries(PLATFORM_DOMAINS) as [
    Exclude<CitationPlatform, 'other'>,
    readonly string[],
  ][]) {
    if (domains.some((d) => hostMatchesDomain(host, d))) return platform
  }
  return 'other'
}

// 社区/UGC 谈论面口径：reddit/quora/youtube/linkedin 是用户生成内容为主的讨论型平台，计入
// 「社区引用占比」；wikipedia（编辑管控的百科参考资料）与 github（代码托管/文档，非讨论型
// UGC）不算——供诊断规则消费 ugcCitationShare 时复用同一份口径，不在规则层再猜一遍。
export function isUgcPlatform(platform: CitationPlatform): boolean {
  return platform === 'reddit' || platform === 'quora' || platform === 'youtube' || platform === 'linkedin'
}
