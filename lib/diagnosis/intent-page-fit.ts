import type { SiteAuditPage } from '@/lib/crawl/site-audit'
import type { RuleContext } from './types'

// Intent-to-Page Fit (IPF)：把真实搜索需求映射到当前承接页。
// 这是启发式诊断层，不作排名承诺；阈值随 RULES_VERSION 固化。

export type SearchIntentKind =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'comparison'
  | 'support'
  | 'local'
  | 'navigational'
  | 'unknown'

export type PageRole =
  | 'home'
  | 'service'
  | 'product'
  | 'collection'
  | 'pricing'
  | 'comparison'
  | 'case_study'
  | 'blog'
  | 'docs'
  | 'support'
  | 'local'
  | 'about'
  | 'tool'
  | 'unknown'

export type IntentPageFitIssueCode =
  | 'missing_landing_page'
  | 'intent_page_mismatch'
  | 'overbroad_landing_page'
  | 'underlinked_landing_page'
  | 'thin_landing_page'
  | 'competing_pages'

export type IntentPageFitAction =
  | 'create_or_assign_landing_page'
  | 'reshape_landing_page'
  | 'split_or_refocus_page'
  | 'strengthen_internal_links'
  | 'consolidate_competing_pages'
  | 'improve_landing_page'
  | 'monitor'

export interface IntentPageFitPage {
  url: string
  role: PageRole
  impressions: number | null
  position: number | null
  inboundLinkCount: number | null
  depth: number | null
  mainTextChars: number | null
}

export interface IntentPageFitRow {
  query: string
  intent: SearchIntentKind
  expectedPageRoles: PageRole[]
  primaryPage: IntentPageFitPage | null
  competingPages: IntentPageFitPage[]
  demand: { impressions: number | null; searchVolume: number | null }
  fitScore: number
  issueCodes: IntentPageFitIssueCode[]
  action: IntentPageFitAction
  evidenceIds: string[]
  source: 'gsc' | 'dataforseo' | 'mixed'
}

export interface OverbroadPageSummary {
  url: string
  role: PageRole
  queryCount: number
  intentCount: number
  totalImpressions: number
  queries: { query: string; intent: SearchIntentKind; impressions: number | null }[]
}

export interface IntentPageFitMap {
  rows: IntentPageFitRow[]
  overbroadPages: OverbroadPageSummary[]
}

export interface IntentPageFitArtifactPayload {
  kind: 'intent_page_fit_map'
  version: 1
  rowCount: number
  issueRowCount: number
  issueCounts: Record<IntentPageFitIssueCode, number>
  rows: Array<{
    query: string
    intent: SearchIntentKind
    expectedPageRoles: PageRole[]
    currentUrl: string | null
    currentPageRole: PageRole | null
    fitScore: number
    impressions: number | null
    searchVolume: number | null
    issueCodes: IntentPageFitIssueCode[]
    action: IntentPageFitAction
    evidenceIds: string[]
    source: IntentPageFitRow['source']
  }>
  overbroadPages: Array<{
    url: string
    role: PageRole
    queryCount: number
    intentCount: number
    totalImpressions: number
    queries: Array<{ query: string; intent: SearchIntentKind; impressions: number | null }>
  }>
}

export function isIntentPageFitArtifactPayload(value: unknown): value is IntentPageFitArtifactPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<IntentPageFitArtifactPayload>
  return payload.kind === 'intent_page_fit_map'
    && payload.version === 1
    && typeof payload.rowCount === 'number'
    && typeof payload.issueRowCount === 'number'
    && Array.isArray(payload.rows)
    && Array.isArray(payload.overbroadPages)
}

const MIN_GSC_IMPRESSIONS = 50
const MIN_DFS_SEARCH_VOLUME = 50
const OVERBROAD_MIN_QUERY_COUNT = 3
const UNDERLINKED_INBOUND_MAX = 1
const THIN_PAGE_CHARS = 300
const ARTIFACT_ROW_LIMIT = 30
const ARTIFACT_OVERBROAD_LIMIT = 10

const EXPECTED_ROLES: Record<SearchIntentKind, PageRole[]> = {
  informational: ['blog', 'docs', 'support', 'tool', 'case_study'],
  commercial: ['comparison', 'collection', 'service', 'product', 'pricing', 'case_study', 'tool'],
  transactional: ['pricing', 'product', 'service', 'collection', 'tool'],
  comparison: ['comparison', 'collection', 'service', 'product', 'blog'],
  support: ['support', 'docs'],
  local: ['local', 'service', 'home'],
  navigational: ['home', 'about', 'product', 'docs'],
  unknown: [],
}

const QUERY_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'near', 'from', 'that', 'this', 'best', 'top', 'how', 'what',
  'why', 'when', 'where', 'which', 'your', 'our', 'buy', 'price', 'pricing', 'service',
  'services', 'software', 'tool',
])

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

export function classifyQueryIntent(query: string, providerIntent?: string | null): SearchIntentKind {
  const q = ` ${query.toLowerCase().replace(/[-_/]+/g, ' ')} `

  if (hasAny(q, [/\bnear me\b/, /\blocal\b/, /\bin my area\b/])) return 'local'
  if (hasAny(q, [/\b(error|errors|fix|issue|problem|not working|setup|install|troubleshoot|troubleshooting|docs|documentation|api|help|support)\b/])) return 'support'
  if (hasAny(q, [/\b(vs|versus|compare|comparison|alternative|alternatives|competitor|competitors|review|reviews|best|top)\b/])) return 'comparison'

  const normalizedProviderIntent = (providerIntent ?? '').toLowerCase()
  if (normalizedProviderIntent.includes('transac')) return 'transactional'
  if (normalizedProviderIntent.includes('commercial')) return 'commercial'
  if (normalizedProviderIntent.includes('info')) return 'informational'
  if (normalizedProviderIntent.includes('navig')) return 'navigational'

  if (hasAny(q, [/\b(buy|order|pricing|price|quote|cost|trial|demo|hire|agency|service|services|supplier|provider|download|sign up|signup|software|platform|solution|solutions)\b/])) return 'transactional'
  if (hasAny(q, [/\b(how|what|why|guide|tutorial|template|example|examples|definition|meaning|learn|ideas|checklist)\b/])) return 'informational'
  return 'unknown'
}

function urlPath(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).pathname || '/'
  } catch {
    return url
  }
}

function comparableUrl(url: string): string {
  const path = (() => {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
      return `${parsed.origin}${parsed.pathname}`.toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  })()
  return path.replace(/\/$/, '')
}

export function classifyPageRole(pageOrUrl: Pick<SiteAuditPage, 'url'> & { title?: string | null } | string): PageRole {
  const url = typeof pageOrUrl === 'string' ? pageOrUrl : pageOrUrl.url
  const title = typeof pageOrUrl === 'string' ? '' : pageOrUrl.title ?? ''
  const path = urlPath(url).toLowerCase()
  const text = ` ${path.replace(/[-_/]+/g, ' ')} ${title.toLowerCase()} `
  if (path === '/' || path === '') return 'home'
  if (hasAny(text, [/\b(docs|documentation|api|developer|developers|reference|sdk)\b/])) return 'docs'
  if (hasAny(text, [/\b(help|support|faq|troubleshoot|troubleshooting|error|setup|install|knowledge base|kb)\b/])) return 'support'
  if (hasAny(text, [/\b(tool|tools|calculator|checker|generator|analyzer|audit)\b/])) return 'tool'
  if (hasAny(text, [/\b(blog|article|articles|news|guide|guides|tutorial|tutorials|post|posts|resource|resources|learn|insights|academy)\b/, /\/20\d\d\//])) return 'blog'
  if (hasAny(text, [/\b(case study|case studies|cases|customers|customer stories|portfolio)\b/])) return 'case_study'
  if (hasAny(text, [/\b(pricing|prices|plans|rates)\b/])) return 'pricing'
  if (hasAny(text, [/\b(vs|versus|compare|comparison|alternative|alternatives|competitor|competitors|review|reviews)\b/])) return 'comparison'
  if (hasAny(text, [/\b(product|products|shop|store|buy|item|items|sku|app|apps|plugin|plugins)\b/])) return 'product'
  if (hasAny(text, [/\b(category|categories|collection|collections|catalog|industries|industry|use case|use cases)\b/])) return 'collection'
  if (hasAny(text, [/\b(service|services|agency|consulting|consultant|solution|solutions|platform)\b/])) return 'service'
  if (hasAny(text, [/\b(location|locations|near me|areas served|city)\b/])) return 'local'
  if (hasAny(text, [/\b(about|company|team|contact|brand)\b/])) return 'about'
  return 'unknown'
}

function keywordTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !QUERY_STOP_WORDS.has(token))
}

function pageTokenText(page: SiteAuditPage): string {
  return `${urlPath(page.url).replace(/[-_/]+/g, ' ')} ${page.title ?? ''}`.toLowerCase()
}

function roleMatchesIntent(role: PageRole, intent: SearchIntentKind): boolean {
  return EXPECTED_ROLES[intent].includes(role)
}

function ownDomainPresent(domain: string, itemDomain: string): boolean {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  return normalize(domain) === normalize(itemDomain)
}

function pageByUrl(pages: SiteAuditPage[]): Map<string, SiteAuditPage> {
  return new Map(pages.map((page) => [comparableUrl(page.url), page]))
}

function toFitPage(page: SiteAuditPage | undefined, fallbackUrl: string, impressions: number | null, position: number | null): IntentPageFitPage {
  const role = page ? classifyPageRole(page) : classifyPageRole(fallbackUrl)
  return {
    url: page?.url ?? fallbackUrl,
    role,
    impressions,
    position,
    inboundLinkCount: page?.inboundLinkCount ?? null,
    depth: page?.depth ?? null,
    mainTextChars: page?.mainTextChars ?? null,
  }
}

function bestSiteCandidate(query: string, expectedRoles: PageRole[], pages: SiteAuditPage[]): SiteAuditPage | null {
  const tokens = keywordTokens(query)
  if (tokens.length === 0) return null
  let best: { page: SiteAuditPage; score: number } | null = null
  for (const page of pages) {
    if (page.checkStatus !== 'checked') continue
    const role = classifyPageRole(page)
    const text = pageTokenText(page)
    const overlap = tokens.filter((token) => text.includes(token)).length
    const roleBoost = expectedRoles.includes(role) ? 2 : 0
    const score = overlap + roleBoost
    if (score < 3) continue
    if (!best || score > best.score) best = { page, score }
  }
  return best?.page ?? null
}

function scoreFit(primaryPage: IntentPageFitPage | null, intent: SearchIntentKind): number {
  if (!primaryPage) return 0
  let score = roleMatchesIntent(primaryPage.role, intent) ? 82 : primaryPage.role === 'unknown' || intent === 'unknown' ? 55 : 38
  if (primaryPage.role === 'home' && intent !== 'navigational' && intent !== 'local' && intent !== 'unknown') score -= 20
  if ((primaryPage.inboundLinkCount ?? UNDERLINKED_INBOUND_MAX + 1) <= UNDERLINKED_INBOUND_MAX && primaryPage.role !== 'home') score -= 15
  if ((primaryPage.depth ?? 0) > 3) score -= 10
  if ((primaryPage.mainTextChars ?? THIN_PAGE_CHARS) < THIN_PAGE_CHARS && intent !== 'navigational') score -= 10
  return Math.max(0, Math.min(100, score))
}

function uniqueIssues(codes: IntentPageFitIssueCode[]): IntentPageFitIssueCode[] {
  return [...new Set(codes)]
}

function actionForIssues(codes: IntentPageFitIssueCode[]): IntentPageFitAction {
  if (codes.includes('missing_landing_page')) return 'create_or_assign_landing_page'
  if (codes.includes('competing_pages')) return 'consolidate_competing_pages'
  if (codes.includes('intent_page_mismatch')) return 'reshape_landing_page'
  if (codes.includes('overbroad_landing_page')) return 'split_or_refocus_page'
  if (codes.includes('underlinked_landing_page')) return 'strengthen_internal_links'
  if (codes.includes('thin_landing_page')) return 'improve_landing_page'
  return 'monitor'
}

function issueCodesFor(row: Omit<IntentPageFitRow, 'issueCodes' | 'action'>): IntentPageFitIssueCode[] {
  const codes: IntentPageFitIssueCode[] = []
  if (!row.primaryPage) {
    codes.push('missing_landing_page')
    return codes
  }
  if (row.intent !== 'unknown' && row.primaryPage.role !== 'unknown' && !roleMatchesIntent(row.primaryPage.role, row.intent)) {
    codes.push('intent_page_mismatch')
  }
  if (row.primaryPage.role === 'home' && row.intent !== 'navigational' && row.intent !== 'local' && row.intent !== 'unknown') {
    codes.push('overbroad_landing_page')
  }
  if ((row.primaryPage.inboundLinkCount ?? UNDERLINKED_INBOUND_MAX + 1) <= UNDERLINKED_INBOUND_MAX && row.intent !== 'navigational' && row.primaryPage.role !== 'home') {
    codes.push('underlinked_landing_page')
  }
  if ((row.primaryPage.mainTextChars ?? THIN_PAGE_CHARS) < THIN_PAGE_CHARS && row.intent !== 'navigational') {
    codes.push('thin_landing_page')
  }
  if (row.competingPages.length >= 2) codes.push('competing_pages')
  return codes
}

function withIssues(row: Omit<IntentPageFitRow, 'issueCodes' | 'action'>): IntentPageFitRow {
  const issueCodes = uniqueIssues(issueCodesFor(row))
  return { ...row, issueCodes, action: actionForIssues(issueCodes) }
}

function addIssue(row: IntentPageFitRow, code: IntentPageFitIssueCode): IntentPageFitRow {
  const issueCodes = uniqueIssues([...row.issueCodes, code])
  return { ...row, issueCodes, action: actionForIssues(issueCodes) }
}

function keywordDataByQuery(ctx: RuleContext): Map<string, RuleContext['dataforseo']['keywordData'][number]> {
  return new Map(ctx.dataforseo.keywordData.map((item) => [item.keyword.trim().toLowerCase(), item]))
}

export function buildIntentPageFitMap(ctx: RuleContext): IntentPageFitMap {
  const audit = ctx.siteAudit
  const pages = audit?.payload.pages ?? []
  const byUrl = pageByUrl(pages)
  const labsByQuery = keywordDataByQuery(ctx)
  const rows = new Map<string, IntentPageFitRow>()

  const qpmByQuery = new Map<string, RuleContext['queryPageMetrics']>()
  for (const metric of ctx.queryPageMetrics) {
    const arr = qpmByQuery.get(metric.query) ?? []
    arr.push(metric)
    qpmByQuery.set(metric.query, arr)
  }

  for (const [query, metrics] of qpmByQuery.entries()) {
    const totalImpressions = metrics.reduce((sum, metric) => sum + metric.impressions, 0)
    if (totalImpressions < MIN_GSC_IMPRESSIONS) continue
    const labs = labsByQuery.get(query.trim().toLowerCase())
    const intent = classifyQueryIntent(query, labs?.intent)
    const expectedPageRoles = EXPECTED_ROLES[intent]
    const pageRows = [...metrics]
      .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
      .map((metric) => toFitPage(byUrl.get(comparableUrl(metric.page)), metric.page, metric.impressions, metric.position))
    const primaryPage = pageRows[0] ?? null
    const baseRow = {
      query,
      intent,
      expectedPageRoles,
      primaryPage,
      competingPages: pageRows,
      demand: { impressions: totalImpressions, searchVolume: labs?.searchVolume ?? null },
      fitScore: scoreFit(primaryPage, intent),
      evidenceIds: [...new Set(metrics.map((metric) => metric.evidenceId).filter((id): id is string => !!id).concat(labs?.evidenceId ? [labs.evidenceId] : []))],
      source: labs ? 'mixed' as const : 'gsc' as const,
    }
    rows.set(query.trim().toLowerCase(), withIssues(baseRow))
  }

  for (const serp of ctx.dataforseo.serpByKeyword) {
    const key = serp.keyword.trim().toLowerCase()
    if (rows.has(key)) continue
    const labs = labsByQuery.get(key)
    if ((labs?.searchVolume ?? 0) < MIN_DFS_SEARCH_VOLUME) continue
    const intent = classifyQueryIntent(serp.keyword, labs?.intent)
    const expectedPageRoles = EXPECTED_ROLES[intent]
    const ownItem = serp.items.find((item) => ownDomainPresent(ctx.project.domain, item.domain))
    const candidate = !ownItem ? bestSiteCandidate(serp.keyword, expectedPageRoles, pages) : null
    if (!ownItem && candidate) continue
    const primaryPage = ownItem ? toFitPage(byUrl.get(comparableUrl(ownItem.url)), ownItem.url, null, ownItem.rank) : null
    const baseRow = {
      query: serp.keyword,
      intent,
      expectedPageRoles,
      primaryPage,
      competingPages: primaryPage ? [primaryPage] : [],
      demand: { impressions: null, searchVolume: labs?.searchVolume ?? null },
      fitScore: scoreFit(primaryPage, intent),
      evidenceIds: [...new Set([serp.evidenceId, labs?.evidenceId].filter((id): id is string => !!id))],
      source: 'dataforseo' as const,
    }
    rows.set(key, withIssues(baseRow))
  }

  let out = [...rows.values()]
  const overbroadPages: OverbroadPageSummary[] = []
  const rowsByPrimary = new Map<string, IntentPageFitRow[]>()
  for (const row of out) {
    if (!row.primaryPage) continue
    const arr = rowsByPrimary.get(comparableUrl(row.primaryPage.url)) ?? []
    arr.push(row)
    rowsByPrimary.set(comparableUrl(row.primaryPage.url), arr)
  }
  for (const pageRows of rowsByPrimary.values()) {
    if (pageRows.length < OVERBROAD_MIN_QUERY_COUNT) continue
    const intents = new Set(pageRows.map((row) => row.intent).filter((intent) => intent !== 'unknown'))
    const primary = pageRows[0].primaryPage!
    const totalImpressions = pageRows.reduce((sum, row) => sum + (row.demand.impressions ?? 0), 0)
    const broadRole = primary.role === 'home' || primary.role === 'unknown'
    if (intents.size < 2 && !broadRole) continue
    overbroadPages.push({
      url: primary.url,
      role: primary.role,
      queryCount: pageRows.length,
      intentCount: intents.size,
      totalImpressions,
      queries: pageRows.map((row) => ({ query: row.query, intent: row.intent, impressions: row.demand.impressions })),
    })
    out = out.map((row) => (row.primaryPage && comparableUrl(row.primaryPage.url) === comparableUrl(primary.url) ? addIssue(row, 'overbroad_landing_page') : row))
  }

  return {
    rows: out.sort((a, b) => (b.demand.impressions ?? b.demand.searchVolume ?? 0) - (a.demand.impressions ?? a.demand.searchVolume ?? 0)),
    overbroadPages: overbroadPages.sort((a, b) => b.totalImpressions - a.totalImpressions || b.queryCount - a.queryCount),
  }
}

function demandValue(row: IntentPageFitRow): number {
  return row.demand.impressions ?? row.demand.searchVolume ?? 0
}

export function buildIntentPageFitArtifactPayload(
  fit: IntentPageFitMap,
  opts: { rowLimit?: number; overbroadLimit?: number } = {},
): IntentPageFitArtifactPayload {
  const issueCounts = Object.fromEntries(
    ([
      'missing_landing_page',
      'intent_page_mismatch',
      'overbroad_landing_page',
      'underlinked_landing_page',
      'thin_landing_page',
      'competing_pages',
    ] satisfies IntentPageFitIssueCode[]).map((code) => [code, 0]),
  ) as Record<IntentPageFitIssueCode, number>

  for (const row of fit.rows) {
    for (const code of row.issueCodes) issueCounts[code] += 1
  }

  const rows = fit.rows
    .filter((row) => row.issueCodes.length > 0)
    .sort((a, b) => b.issueCodes.length - a.issueCodes.length || a.fitScore - b.fitScore || demandValue(b) - demandValue(a))
    .slice(0, opts.rowLimit ?? ARTIFACT_ROW_LIMIT)
    .map((row) => ({
      query: row.query,
      intent: row.intent,
      expectedPageRoles: row.expectedPageRoles,
      currentUrl: row.primaryPage?.url ?? null,
      currentPageRole: row.primaryPage?.role ?? null,
      fitScore: row.fitScore,
      impressions: row.demand.impressions,
      searchVolume: row.demand.searchVolume,
      issueCodes: row.issueCodes,
      action: row.action,
      evidenceIds: row.evidenceIds,
      source: row.source,
    }))

  return {
    kind: 'intent_page_fit_map',
    version: 1,
    rowCount: fit.rows.length,
    issueRowCount: fit.rows.filter((row) => row.issueCodes.length > 0).length,
    issueCounts,
    rows,
    overbroadPages: fit.overbroadPages
      .slice(0, opts.overbroadLimit ?? ARTIFACT_OVERBROAD_LIMIT)
      .map((page) => ({
        url: page.url,
        role: page.role,
        queryCount: page.queryCount,
        intentCount: page.intentCount,
        totalImpressions: page.totalImpressions,
        queries: page.queries.slice(0, 8),
      })),
  }
}
