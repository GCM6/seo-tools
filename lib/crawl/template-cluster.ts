// URL 模板聚类：把动态路由（/products/123、/blog/2026/07/x）按结构归并，
// 深检只跑每模板一个代表页。整套是启发式推断（claim_type: inferred），不是硬证据。

export interface TemplateCluster {
  pattern: string
  urls: string[]
}
export interface RepresentativeCandidate {
  url: string
  mainTextChars: number | null
  httpStatus: number | null
  checkStatus: string
}
export interface TemplatePlan {
  pattern: string
  pageUrls: string[]
  representativeUrl: string | null
}

// 说明：1-2 位纯数字段既可能是分页/id 也可能是月/日，无上下文不可判。
// 折中：只有紧跟在 {date}(年份) 之后的 1-2 位数字段才算 {date}，否则走 {id}。
export function normalizeSegment(seg: string, prevToken?: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return '{uuid}'
  if (/^\d{4}(-\d{2}){1,2}$/.test(seg)) return '{date}'
  if (/^(19|20)\d{2}$/.test(seg)) return '{date}'
  if (/^\d{1,2}$/.test(seg) && prevToken === '{date}') return '{date}'
  if (/^\d+$/.test(seg)) return '{id}'
  return seg
}

const SLUG_MIN_SIBLINGS = 3

export function clusterTemplates(urls: string[], entryUrl?: string): TemplateCluster[] {
  const meta = urls.map((url) => {
    const segsRaw = new URL(url).pathname.split('/').filter(Boolean)
    const segs: string[] = []
    for (const s of segsRaw) segs.push(normalizeSegment(s, segs[segs.length - 1]))
    return { url, segs }
  })

  // 同父路径下 ≥3 个不同「字面」尾段 → {slug}（入口页豁免，永远单独成组）。
  const parentTails = new Map<string, Set<string>>()
  for (const m of meta) {
    if (!m.segs.length) continue
    const tail = m.segs[m.segs.length - 1]
    if (tail.startsWith('{')) continue
    const parent = m.segs.slice(0, -1).join('/')
    if (!parentTails.has(parent)) parentTails.set(parent, new Set())
    parentTails.get(parent)!.add(tail)
  }
  for (const m of meta) {
    if (entryUrl && m.url === entryUrl) continue
    if (!m.segs.length) continue
    const tail = m.segs[m.segs.length - 1]
    if (tail.startsWith('{')) continue
    const parent = m.segs.slice(0, -1).join('/')
    if ((parentTails.get(parent)?.size ?? 0) >= SLUG_MIN_SIBLINGS) {
      m.segs = [...m.segs.slice(0, -1), '{slug}']
    }
  }

  const byPattern = new Map<string, string[]>()
  for (const m of meta) {
    const pattern = '/' + m.segs.join('/')
    if (!byPattern.has(pattern)) byPattern.set(pattern, [])
    byPattern.get(pattern)!.push(m.url)
  }
  return [...byPattern.entries()].map(([pattern, u]) => ({ pattern, urls: u }))
}

// 代表页：健康页（200 且 checked）里正文字符数取中位 —— 该模板下最「典型」的页面。
export function selectRepresentative(pages: RepresentativeCandidate[]): string | null {
  if (!pages.length) return null
  const ok = pages.filter((p) => p.checkStatus === 'checked' && p.httpStatus === 200)
  if (!ok.length) return pages[0].url
  const sorted = [...ok].sort((a, b) => (a.mainTextChars ?? 0) - (b.mainTextChars ?? 0))
  return sorted[Math.floor((sorted.length - 1) / 2)].url
}

export function planTemplates(pages: RepresentativeCandidate[], entryUrl: string): TemplatePlan[] {
  const byUrl = new Map(pages.map((p) => [p.url, p]))
  return clusterTemplates(
    pages.map((p) => p.url),
    entryUrl,
  ).map((c) => ({
    pattern: c.pattern,
    pageUrls: c.urls,
    representativeUrl: selectRepresentative(c.urls.map((u) => byUrl.get(u)!)),
  }))
}
