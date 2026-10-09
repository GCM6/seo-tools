import type { FindingDetailJson, FindingDetailRow } from '@/db/schema'
import type { RuleHit } from './types'

// 发现明细（spec 2026-10-09 §6.4）：把各规则形状不一的 hit.detail 转成统一的「页面 / 字段 / 现在 / 应该」。
// 只搬运规则已经给出的信息，缺的值为 null；不改规则判定。键表依据见计划 Task 4。
const MAX_ROWS = 20

type D = Record<string, unknown>
type Extracted = { affected: number | null; total?: number | null; rows: FindingDetailRow[] }
type Extractor = (d: D, scope: string) => Extracted

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : null)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): D => (typeof v === 'object' && v !== null ? (v as D) : {})
const strs = (v: unknown): string[] => list(v).map(str).filter((x): x is string => x !== null)
const row = (url: string | null, field: string, current: string | null = null, expected: string | null = null): FindingDetailRow => ({ url, field, current, expected })
const urlOrNull = (scope: string): string | null => (/^https?:\/\//i.test(scope) ? scope : null)
// 比例 → 百分比：低于 10% 保留一位小数（CTR 0.004 写 0.4%，不能取整成 0%），10% 及以上取整。
// 先按一位小数舍入再判断，免得 9.96% 写成「10.0%」。
const pct = (v: unknown): string | null => {
  const n = num(v)
  if (n === null) return null
  const oneDecimal = Math.round(n * 1000) / 10
  return Math.abs(oneDecimal) < 10 ? `${oneDecimal.toFixed(1)}%` : `${Math.round(n * 100)}%`
}

// 页面清单类：examples / sampleUrls 等是字符串数组。
const urlList = (key: string, field: string, current: string | null = null, affectedKey = 'count'): Extractor => (d) => ({
  affected: num(d[affectedKey]),
  rows: strs(d[key]).map((u) => row(u, field, current)),
})

// 来源页类（L01/L02/L03/L07）：要改的是来源页里的链接。
const linkSources = (current: (ex: D, src: D) => string | null, expected: (ex: D) => string | null, affectedKey: string): Extractor => (d) => ({
  affected: num(d[affectedKey]),
  rows: list(d.examples).flatMap((e) => {
    const ex = obj(e)
    return list(ex.sources).map((s) => row(str(obj(s).from), '链接 href', current(ex, obj(s)), expected(ex)))
  }),
})

const AR_FIELD: Record<string, string> = { AR01: '作者署名', AR02: '作者页链接', AR03: '发布/更新日期', AR04: '数据来源引用', AR05: '权威来源引用' }
const article = (id: string): Extractor => (d) => ({
  affected: num(d.missingCount) ?? num(d.unsupportedCount),
  total: num(d.articleCount),
  rows: strs(d.sampleUrls).map((u) => row(u, AR_FIELD[id], '缺失')),
})
const keywordRows = (current: (k: D) => string | null): Extractor => (d) => ({
  affected: list(d.keywords).length || null,
  rows: list(d.keywords).map((k) => row(null, `关键词：${str(obj(k).text) ?? ''}`, current(obj(k)))),
})
const fitRows: Extractor = (d) => ({
  affected: num(d.count),
  rows: list(d.keywords).map((k) => {
    const kw = obj(k)
    return row(str(kw.currentUrl), `关键词：${str(kw.text) ?? ''}`, str(kw.currentPageRole) ?? '无承接页', strs(kw.expectedPageRoles).join(' / ') || null)
  }),
})
const ENTRY_LABEL: Record<string, string> = { author: '作者', date: '日期', about_contact: '关于/联系页', statistics: '统计数据', citations: '外部引用', quotes: '引语' }
const entryMissing: Extractor = (d, scope) => ({
  affected: strs(d.missing).length || null,
  rows: strs(d.missing).map((m) => row(urlOrNull(scope), ENTRY_LABEL[m] ?? m, '缺失')),
})

const EXTRACTORS: Record<string, Extractor> = {
  T01: (d) => ({ affected: num(d.blockedCount), rows: strs(d.blockedUrls).map((u) => row(u, 'robots.txt 禁止 Googlebot 抓取', '被禁止')) }),
  T02: (d) => ({
    affected: (num(d.http4xx) ?? 0) + (num(d.http5xx) ?? 0) - (num(d.denied) ?? 0) || null,
    total: num(d.checked),
    rows: list(d.examples).map((e) => row(str(obj(e).url), 'HTTP 状态码', str(obj(e).status))),
  }),
  T03: urlList('examples', 'meta robots', 'noindex'),
  T04: (d) => ({ affected: num(d.count), rows: list(d.examples).map((e) => row(str(obj(e).url), 'canonical', str(obj(e).canonical))) }),
  T05: urlList('examples', '站内入链数', '0'),
  T06: urlList('examples', '重定向', '会跳转'),
  T08: urlList('examples', 'HTTPS / 混合内容'),
  T09a: (d) => ({ affected: null, rows: list(d.failing).map((f) => row(null, `${str(obj(f).metric) ?? ''}（${str(obj(f).strategy) ?? ''}）`, str(obj(f).value))) }),
  T09b: (d) => ({ affected: null, rows: list(d.clues).map((c) => row(null, str(obj(c).title) ?? '性能优化项', num(obj(c).savingsMs) === null ? null : `可省约 ${num(obj(c).savingsMs)} ms`)) }),
  T10: (d, scope) => ({ affected: 1, rows: [row(urlOrNull(scope), '初始 HTML 正文占渲染后比例', pct(d.ratio))] }),
  T11: (d) => ({ affected: 1, rows: [row(str(d.url), '站内入链数', str(d.inboundLinkCount), num(d.threshold) === null ? null : `≥ ${num(d.threshold)}`)] }),
  T12: (d) => ({
    affected: num(d.count),
    rows: list(d.examples).map((e) => row(str(obj(e).url), '点击深度', str(obj(e).depth), num(d.maxDepth) === null ? null : `≤ ${num(d.maxDepth)}`)),
  }),
  T13: urlList('examples', 'viewport meta', '缺失'),
  T14: (d) => ({
    affected: strs(d.invalidCodes).length + (d.hasXDefault === false ? 1 : 0) || null,
    rows: [
      ...strs(d.invalidCodes).map((c) => row(null, 'hreflang', c, str(obj(d.suggestions)[c]))),
      ...(d.hasXDefault === false ? [row(null, 'hreflang x-default', '缺失')] : []),
    ],
  }),
  T15: (d) => ({ affected: num(d.zeroImpressionCount), total: num(d.langPageCount), rows: strs(d.sampleUrls).map((u) => row(u, 'GSC 展示量', '0')) }),
  L01: linkSources((ex, s) => `${str(s.linkedAs) ?? str(ex.url) ?? ''}（${str(ex.httpStatus) ?? str(ex.reason) ?? '不可达'}）`, () => null, 'brokenTargets'),
  L02: linkSources((ex, s) => str(s.linkedAs) ?? str(ex.url), (ex) => str(ex.finalUrl), 'count'),
  L03: linkSources((ex) => `${str(ex.url) ?? ''}（${str(ex.reason) ?? ''}）`, () => null, 'count'),
  L04: urlList('examples', '站内可达性', '只在孤岛内互链'),
  L05: (d) => ({
    affected: num(d.count),
    rows: list(d.examples).flatMap((e) => list(obj(e).via).map((v) => row(str(obj(v).from), 'rel=nofollow', `nofollow → ${str(obj(e).url) ?? ''}`))),
  }),
  L06: urlList('examples', '站内出链数', '0'),
  L07: linkSources((ex) => `${str(ex.url) ?? ''}（${str(ex.status) ?? ''}）`, () => null, 'count'),
  W01: (d) => ({ affected: num(d.count), rows: list(d.examples).map((e) => row(str(obj(e).url), '站内权重相对值', str(obj(e).relative))) }),
  W02: (d) => ({
    affected: num(d.count),
    rows: list(d.examples).map((e) => row(str(obj(e).url), '站内权重相对值', `${str(obj(e).relative) ?? ''}（${strs(obj(e).reasons).join('、')}）`)),
  }),
  W03: (d) => ({
    affected: num(d.count),
    rows: list(d.examples).flatMap((e) => list(obj(e).samples).map((s) => row(str(obj(s).from), '锚文本', str(obj(s).anchor)))),
  }),
  W04: (d) => ({ affected: num(d.count), rows: list(d.examples).map((e) => row(str(obj(e).url), '正文入链占比', pct(obj(e).mainShare))) }),
  C01: (d, scope) => ({ affected: 1, rows: [row(urlOrNull(scope), '<title>', str(d.title) ?? '缺失', num(d.max) === null ? null : `≤ ${num(d.max)} 字符`)] }),
  C02: (_d, scope) => ({ affected: 1, rows: [row(urlOrNull(scope), 'meta description')] }),
  // C03 三种命中：缺 H1 / 多个 H1 → 每页唯一 H1；H1 与 title 完全相同（detail 带 title + h1）→ 规则说这不是错误，
  // 只是可考虑差异化表达以覆盖更多说法，所以「应该」写差异化而不是唯一。
  C03: (d, scope) => ({
    affected: 1,
    rows: [row(
      urlOrNull(scope),
      'H1',
      strs(d.h1Texts).join(' | ') || str(d.h1) || `${num(d.h1Count) ?? 0} 个`,
      str(d.title) !== null && str(d.h1) !== null ? '与 title 差异化表达（可选，不是错误）' : '每页唯一 H1',
    )],
  }),
  C04: (d) => ({ affected: num(d.pageCount), rows: [row(str(d.representativeUrl), '正文字符数', str(d.mainTextChars), num(d.threshold) === null ? null : `≥ ${num(d.threshold)}`)] }),
  C05a: (d) => ({ affected: 1, rows: [row(null, '结构化数据类型', (strs(d.foundTypes).length ? strs(d.foundTypes) : strs(d.presentTypes)).join(', ') || null)] }),
  C05b: (d) => ({ affected: strs(d.pages).length || null, rows: strs(d.pages).map((u) => row(u, 'JSON-LD', '语法或 @context 错误')) }),
  C05c: (d) => ({
    affected: num(d.total),
    rows: list(d.examples).flatMap((e) => strs(obj(e).missing).map((m) => row(str(obj(e).url), `${str(obj(e).type) ?? ''}.${m}`, '缺失'))),
  }),
  C05d: (d) => ({ affected: num(d.mismatchCount), rows: list(d.mismatches).map((m) => row(null, str(obj(m).field) ?? 'JSON-LD 字段', str(obj(m).value))) }),
  C06: entryMissing,
  C07: entryMissing,
  C09: (d) => ({ affected: num(d.missing), total: num(d.imgs), rows: strs(d.examples).map((u) => row(u, 'img alt', '缺失')) }),
  C10: (d) => ({
    affected: num(d.duplicatePageCount),
    rows: list(d.examples).flatMap((g) => strs(obj(g).urls).map((u) => row(u, '正文', '与同组其他页正文完全相同'))),
  }),
  C11: (d) => ({ affected: num(d.count), rows: strs(d.examples).map((u) => row(u, '平均段落长度', null, num(d.threshold) === null ? null : `≤ ${num(d.threshold)} 词`)) }),
  TA01: (d) => ({
    affected: list(d.shallowClusters).length + list(d.isolatedClusters).length || null,
    rows: [...list(d.shallowClusters), ...list(d.isolatedClusters)].map((c) => row(null, `话题群 ${str(obj(c).pattern) ?? ''}`, `${str(obj(c).pageCount) ?? '?'} 页，平均入链 ${str(obj(c).avgInbound) ?? '?'}`)),
  }),
  TA02: (d) => ({
    affected: list(d.clustersWithoutHub).length || null,
    rows: list(d.clustersWithoutHub).map((c) => row(str(obj(c).representativeUrl), `话题群 ${str(obj(c).pattern) ?? ''} 缺中心页`, `最大入链 ${str(obj(c).maxInbound) ?? '?'}`)),
  }),
  AR01: article('AR01'),
  AR02: article('AR02'),
  AR03: article('AR03'),
  AR04: article('AR04'),
  AR05: article('AR05'),
  TR06: (d) => {
    const label: Record<string, string> = { about: '关于页', contact: '联系页', privacy: '隐私政策页', terms: '服务条款页' }
    const state: Record<string, string> = { missing: '缺失', broken: '链接失效', unreachable: '不可达' }
    const rows = (['missing', 'broken', 'unreachable'] as const).flatMap((k) => strs(d[k]).map((c) => row(null, label[c] ?? c, state[k])))
    return { affected: rows.length || null, rows }
  },
  SO02: (d) => {
    const rows = [
      ...strs(d.inSchemaNotLinked).map((p) => row(null, p, 'schema 已声明，站内未链接')),
      ...strs(d.linkedNotInSchema).map((p) => row(null, p, '站内已链接，schema 未声明')),
    ]
    return { affected: rows.length || null, rows }
  },
  G01: (d) => ({ affected: strs(d.blocked).length || null, rows: strs(d.blocked).map((ua) => row(null, `robots.txt：${ua}`, 'Disallow')) }),
  G02: (d) => ({ affected: list(d.blocked).length || null, rows: list(d.blocked).map((b) => row(str(obj(b).url), str(obj(b).ua) ?? 'UA', str(obj(b).status) ?? '无响应')) }),
  G03: (d, scope) => ({ affected: 1, rows: [row(urlOrNull(scope), '初始 / 渲染后正文字符数', `${str(d.initialChars) ?? '?'} / ${str(d.renderedChars) ?? '?'}`)] }),
  E01: (d) => ({ affected: 1, rows: [row(null, 'Organization.sameAs', strs(d.sameAs).join(', ') || '缺失', strs(d.authorityHosts).join(', ') || null)] }),
  G04: (d) => ({ affected: 1, rows: [row(null, 'Bing 收录数', str(d.indexed))] }),
  K01: keywordRows((k) => `排名 ${str(k.position) ?? '?'}`),
  K02: keywordRows((k) => `CTR ${pct(k.ctr) ?? '?'}，排名 ${str(k.position) ?? '?'}`),
  K03: keywordRows((k) => (num(k.ourPosition) === null ? '未排名' : `排名 ${num(k.ourPosition)}`)),
  K04: keywordRows((k) => (num(k.ourPosition) === null ? '未排名' : `排名 ${num(k.ourPosition)}`)),
  K05: (d) => ({
    affected: 1,
    rows: [row(null, `品牌词：${str(d.brandQuery) ?? ''}`, str(obj(d.top).domain) ? `首位 ${str(obj(d.top).domain)}` : '本站未出现')],
  }),
  K06: (d) => ({
    affected: list(d.queries).length || null,
    rows: list(d.queries).flatMap((q) => list(obj(q).pages).map((p) => row(str(obj(p).url), `关键词：${str(obj(q).query) ?? ''}`, `排名 ${str(obj(p).position) ?? '?'}`))),
  }),
  K07: (d) => ({
    affected: list(d.keywords).length || null,
    rows: list(d.keywords).map((k) => row(str(obj(k).ourUrl), `关键词：${str(obj(k).text) ?? ''}`, str(obj(k).ourPageType), str(obj(k).expectedPageType))),
  }),
  IPF01: fitRows,
  IPF02: fitRows,
  IPF03: (d) => ({
    affected: num(d.count),
    rows: list(d.pages).map((p) => row(str(obj(p).url), '承接关键词', `${str(obj(p).queryCount) ?? '?'} 个词、${str(obj(p).intentCount) ?? '?'} 种意图`)),
  }),
  IPF04: fitRows,
  Q03: keywordRows((k) => (str(k.gapType) === 'missing' ? '竞品有排名、本站没有' : '本站排名偏弱')),
  A01: (d) => ({
    affected: 1,
    rows: [row(null, '引荐域数', str(obj(d.own).referringDomains), num(d.competitorMedianReferringDomains) === null ? null : `竞品中位数 ${num(d.competitorMedianReferringDomains)}`)],
  }),
  TR04: () => ({ affected: 1, rows: [row(null, '配送政策页', '未找到')] }),
  TR05: () => ({ affected: 1, rows: [row(null, '退货退款政策页', '未找到')] }),
  SP01: (d) => ({ affected: 1, rows: [row(null, str(d.platform) ?? 'youtube', `结果数 ${str(d.resultCount) ?? '0'}`)] }),
  SP02: (d) => ({ affected: list(d.platforms).length || null, rows: list(d.platforms).map((p) => row(null, str(obj(p).platform) ?? '', `结果数 ${str(obj(p).resultCount) ?? '0'}`)) }),
}

// 站级 / 抽样 / 对比类：命中里没有逐项明细（spec 允许 detail 为空）。
export const NO_DETAIL_RULES: ReadonlySet<string> = new Set([
  'T07', 'T09c', 'C08', 'SO01', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'Q01', 'Q02', 'A02', 'A03', 'E02', 'E03',
])
// 计数核对：提取器 70 条 + 无明细 17 条 = 87 条注册规则（测试第一条用例锁死）。
export const EXTRACTED_RULES: readonly string[] = Object.keys(EXTRACTORS)

export function toFindingDetail(hit: Pick<RuleHit, 'ruleId' | 'scope' | 'detail'>): FindingDetailJson | null {
  const extract = EXTRACTORS[hit.ruleId]
  if (!extract) return null
  let out: Extracted
  try {
    out = extract(hit.detail ?? {}, hit.scope)
  } catch {
    out = { affected: null, rows: [] }
  }
  const rows = out.rows.slice(0, MAX_ROWS)
  return {
    scale: out.total === undefined ? { affected: out.affected } : { affected: out.affected, total: out.total },
    rows,
    truncated: out.rows.length > MAX_ROWS,
  }
}
