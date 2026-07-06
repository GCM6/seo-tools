// PageSpeed Insights (PSI) 采集器 —— 支柱 P1 性能检查组 T09a-c 的证据源。
//
// 定位（见 v3 方法论 §3.1 / §4「性能检查组定位说明」）：
//   - CrUX 字段数据（loadingExperience）是 Google 排名使用的 CWV 真实用户数据 → L4，可作排名信号解读。
//   - Lighthouse 实验室数据（lighthouseResult）仅作诊断/修复线索 → inferred，
//     **绝不可**作为排名输入；调用方展示时须恒标「实验室模拟，非排名输入」。
//
// PSI v5 端点免费、无需鉴权即可调用；可选的 PAGESPEED_API_KEY 仅用于提高配额，不改变返回结构。
// 本模块是自包含的纯采集器：不落库、不耦合 RuleContext，仅解析为结构化 PsiResult。

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

export type PsiStrategy = 'mobile' | 'desktop'

export interface PsiResult {
  strategy: PsiStrategy
  // CrUX 字段数据（field data）。小流量站无足够真实用户样本时整体缺失 → hasFieldData=false，各指标 null。
  crux: {
    lcpMs: number | null
    inpMs: number | null
    cls: number | null
    hasFieldData: boolean
  }
  // Lighthouse 实验室数据（lab data）—— 仅诊断，非排名输入。
  lighthouse: {
    performanceScore: number | null // 0-100，恒标「实验室模拟分」
    opportunities: { id: string; title: string; savingsMs?: number }[]
    ttfbMs: number | null
  }
}

// 类型注入用的最小 fetch 形状；默认用全局 fetch，测试注入 mock。
export type FetchImpl = (url: string) => Promise<Response>

/**
 * PSI 免费且无需 key 即可工作，因此永远视为「已配置」。
 * 可选的 PAGESPEED_API_KEY 仅用于提升配额（避免匿名调用的速率限制）。
 */
export function isPsiConfigured(): boolean {
  return true
}

function buildUrl(url: string, strategy: PsiStrategy): string {
  const params = new URLSearchParams({ url, strategy, category: 'performance' })
  const key = process.env.PAGESPEED_API_KEY
  if (key) params.set('key', key)
  return `${PSI_ENDPOINT}?${params.toString()}`
}

// CrUX metric 名到毫秒/比值的安全取值。PSI 的 CrUX percentile 单位：LCP/INP 为毫秒，CLS 为 ×100 的整数。
function readCruxMetric(metrics: Record<string, unknown> | undefined, key: string): number | null {
  const metric = metrics?.[key]
  if (!metric || typeof metric !== 'object') return null
  const percentile = (metric as Record<string, unknown>).percentile
  return typeof percentile === 'number' ? percentile : null
}

/**
 * 拉取并解析单次 PSI 结果。永不因字段缺失抛错 —— 缺失即返回 null / 空数组。
 * @param url 目标页面 URL
 * @param strategy 'mobile' | 'desktop'（移动/桌面分列，见 T09a）
 * @param fetchImpl 可注入的 fetch（测试用）
 */
export async function fetchPageSpeedInsights(
  url: string,
  strategy: PsiStrategy,
  fetchImpl: FetchImpl = fetch,
): Promise<PsiResult> {
  const res = await fetchImpl(buildUrl(url, strategy))

  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    // 响应非 JSON（网络/配额错误页）→ 全 null 降级，不抛错。
    json = {}
  }

  // ── CrUX 字段数据 ──────────────────────────────────────────────
  const loadingExperience = json.loadingExperience as Record<string, unknown> | undefined
  const cruxMetrics = loadingExperience?.metrics as Record<string, unknown> | undefined
  const lcpMs = readCruxMetric(cruxMetrics, 'LARGEST_CONTENTFUL_PAINT_MS')
  const inpMs = readCruxMetric(cruxMetrics, 'INTERACTION_TO_NEXT_PAINT')
  const clsRaw = readCruxMetric(cruxMetrics, 'CUMULATIVE_LAYOUT_SHIFT_SCORE')
  // CLS 在 CrUX 中以 ×100 整数上报（如 10 表示 0.10），归一化为比值。
  const cls = clsRaw === null ? null : clsRaw / 100
  const hasFieldData =
    !!cruxMetrics && (lcpMs !== null || inpMs !== null || cls !== null)

  // ── Lighthouse 实验室数据（诊断，非排名）────────────────────────
  const lighthouseResult = json.lighthouseResult as Record<string, unknown> | undefined
  const categories = lighthouseResult?.categories as Record<string, unknown> | undefined
  const perfCategory = categories?.performance as Record<string, unknown> | undefined
  const rawScore = perfCategory?.score
  const performanceScore =
    typeof rawScore === 'number' ? Math.round(rawScore * 100) : null

  const audits = lighthouseResult?.audits as Record<string, unknown> | undefined
  const opportunities = extractOpportunities(audits)
  const ttfbMs = readTtfb(audits)

  return {
    strategy,
    crux: { lcpMs, inpMs, cls, hasFieldData },
    lighthouse: { performanceScore, opportunities, ttfbMs },
  }
}

// Lighthouse「机会」审计：details.type === 'opportunity' 且有节省毫秒。按节省量降序，供修复清单。
function extractOpportunities(
  audits: Record<string, unknown> | undefined,
): { id: string; title: string; savingsMs?: number }[] {
  if (!audits) return []
  const out: { id: string; title: string; savingsMs?: number }[] = []
  for (const [id, value] of Object.entries(audits)) {
    if (!value || typeof value !== 'object') continue
    const audit = value as Record<string, unknown>
    const details = audit.details as Record<string, unknown> | undefined
    if (details?.type !== 'opportunity') continue
    const savings = details.overallSavingsMs
    const title = typeof audit.title === 'string' ? audit.title : id
    out.push({
      id,
      title,
      ...(typeof savings === 'number' ? { savingsMs: savings } : {}),
    })
  }
  return out.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0))
}

// TTFB 取 Lighthouse 的 server-response-time 审计 numericValue（毫秒）。
function readTtfb(audits: Record<string, unknown> | undefined): number | null {
  const audit = audits?.['server-response-time'] as Record<string, unknown> | undefined
  const v = audit?.numericValue
  return typeof v === 'number' ? v : null
}
