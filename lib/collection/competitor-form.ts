import type { SeedSerpEntry } from '@/lib/dataforseo/types'
import type { LightCheckPage } from '@/lib/crawl/light-check'

// Q03 竞品内容形态（SP-A2）：轻检确认竞品在种子词上的排名页，归纳页面类型/字数量级/结构，
// 作为 content_brief「SERP Top-5 竞品内容形态」段的输入。全部 L3 推断，标签仅供参考非事实。

export interface CompetitorFormTarget {
  keyword: string
  url: string
  domain: string
}

export interface CompetitorFormSignal {
  keyword: string
  domain: string
  url: string
  title: string | null
  pageType: 'faq' | 'listicle' | 'article' | 'page'
  mainTextChars: number
  listCount: number
  tableCount: number
  h2QuestionRate: number
}

// 选目标：逐种子词取 domain∈确认竞品 的最高排名（rank 最小）item 的 url，一词一条；
// 按 url 去重；截断 cap。不依赖 gap 计算（解耦）。
export function selectCompetitorFormTargets(
  serpResults: SeedSerpEntry[],
  confirmedDomains: string[],
  cap = 5,
): CompetitorFormTarget[] {
  const confirmed = new Set(confirmedDomains)
  const seen = new Set<string>()
  const targets: CompetitorFormTarget[] = []
  for (const entry of serpResults) {
    if (targets.length >= cap) break
    const top = [...entry.items]
      .filter((it) => confirmed.has(it.domain) && it.url)
      .sort((a, b) => a.rank - b.rank)[0]
    if (!top || seen.has(top.url)) continue
    seen.add(top.url)
    targets.push({ keyword: entry.keyword, url: top.url, domain: top.domain })
  }
  return targets
}

// 页面类型启发式（标签仅供参考）：问答 H2 密集 → faq；列表多 → listicle；长文 → article；否则 page。
export function inferPageType(page: {
  h2QuestionRate: number
  listCount: number
  mainTextChars: number
}): CompetitorFormSignal['pageType'] {
  if (page.h2QuestionRate >= 0.3) return 'faq'
  if (page.listCount >= 5) return 'listicle'
  if (page.mainTextChars >= 2500) return 'article'
  return 'page'
}

// LightCheckPage → CompetitorFormSignal。
export function deriveContentForm(target: CompetitorFormTarget, page: LightCheckPage): CompetitorFormSignal {
  return {
    keyword: target.keyword,
    domain: target.domain,
    url: target.url,
    title: page.title,
    pageType: inferPageType({
      h2QuestionRate: page.extra.h2QuestionRate,
      listCount: page.extra.listCount,
      mainTextChars: page.mainTextChars,
    }),
    mainTextChars: page.mainTextChars,
    listCount: page.extra.listCount,
    tableCount: page.extra.tableCount,
    h2QuestionRate: page.extra.h2QuestionRate,
  }
}

const PAGE_TYPE_LABEL: Record<CompetitorFormSignal['pageType'], string> = {
  faq: '问答型',
  listicle: '榜单型',
  article: '长文型',
  page: '常规页',
}

// 汇总为 brief 用的一段人读中文串；空 → ''（路由据此决定是否传 competitorForm）。
export function summarizeCompetitorForm(signals: CompetitorFormSignal[]): string {
  if (signals.length === 0) return ''
  return signals
    .map((s) => {
      const title = s.title ? `「${s.title}」` : ''
      const struct = `约 ${s.mainTextChars} 字，${s.listCount} 个列表/${s.tableCount} 个表格`
      return `[${s.keyword}] ${s.domain}${title}（${PAGE_TYPE_LABEL[s.pageType]}，${struct}）`
    })
    .join('；')
}

// 采集（薄 IO，DI）：逐 target 轻检，仅成功页派生信号，错误/4xx 页跳过。
export async function collectCompetitorForm(
  targets: CompetitorFormTarget[],
  deps: { fetchLightCheck: (url: string, host: string) => Promise<LightCheckPage> },
): Promise<CompetitorFormSignal[]> {
  const signals: CompetitorFormSignal[] = []
  for (const t of targets) {
    let host = ''
    try {
      host = new URL(t.url).hostname
    } catch {
      continue
    }
    const page = await deps.fetchLightCheck(t.url, host)
    if (page.checkStatus === 'checked' && page.httpStatus > 0 && page.httpStatus < 400) {
      signals.push(deriveContentForm(t, page))
    }
  }
  return signals
}
