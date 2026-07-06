// GSC Search Analytics 纯客户端 —— 直接打 webmasters v3 REST，不引 googleapis。
// 返回原始行由采集层落库为 L4 证据（keyword_metrics.source='gsc'）。此文件不 import DB：
// mapper 只产出 plain object，持久化由 collection 层完成，保持纯函数可测。

const API_BASE = 'https://www.googleapis.com/webmasters/v3'

export interface GscRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type GscDimension = 'query' | 'page'

export interface QueryOptions {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  dimensions: GscDimension[]
  rowLimit?: number
}

interface SearchAnalyticsResponse {
  rows?: {
    keys?: string[]
    clicks?: number
    impressions?: number
    ctr?: number
    position?: number
  }[]
  error?: { message?: string }
}

// POST searchAnalytics/query。siteUrl（含 sc-domain: 前缀或完整站点 URL）必须整体编码进路径。
export async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  opts: QueryOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<GscRow[]> {
  const url = `${API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: opts.dimensions,
      rowLimit: opts.rowLimit ?? 1000,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as SearchAnalyticsResponse
  if (!res.ok) {
    throw new Error(`gsc search analytics failed: ${res.status} ${body.error?.message ?? ''}`.trim())
  }
  return (body.rows ?? []).map((r) => ({
    keys: r.keys ?? [],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }))
}

interface SitesListResponse {
  siteEntry?: { siteUrl?: string }[]
  error?: { message?: string }
}

// 列出已授权站点（供用户选 gscSiteUrl）。仅返回有权限的站点 URL。
export async function listSites(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const res = await fetchImpl(`${API_BASE}/sites`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const body = (await res.json().catch(() => ({}))) as SitesListResponse
  if (!res.ok) {
    throw new Error(`gsc list sites failed: ${res.status} ${body.error?.message ?? ''}`.trim())
  }
  return (body.siteEntry ?? []).map((e) => e.siteUrl ?? '').filter(Boolean)
}

// keyword_metrics 表所需形状（不含 id/runId/keywordId/evidenceId——那些由采集层补）。
// ctr/position 是文本列：GSC 给的是数值，原样字符串化保精度。
export interface KeywordMetricInput {
  keyText: string
  dimension: GscDimension
  source: 'gsc'
  clicks: number
  impressions: number
  ctr: string
  position: string
}

// 纯 mapper：GscRow[] → 待落库对象。keys[0] 即该维度的实体（query 文本或 page URL）。
// 空 keys 的行（GSC 偶发聚合行）跳过，避免落入空 keyText。
export function mapRowsToKeywordMetrics(rows: GscRow[], dimension: GscDimension): KeywordMetricInput[] {
  return rows
    .filter((r) => r.keys.length > 0 && r.keys[0])
    .map((r) => ({
      keyText: r.keys[0],
      dimension,
      source: 'gsc' as const,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: String(r.ctr),
      position: String(r.position),
    }))
}
