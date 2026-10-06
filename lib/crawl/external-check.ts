import { safeFetch } from '@/lib/security/safe-fetch'
import { SsrfBlockedError } from '@/lib/security/ssrf-guard'
import type { LinkGraphExternal } from './link-graph'

// 站外链接抽检（spec S2 §4）：只测状态码可达性，单次测量。404/410 才下失效结论（且须 GET 复核），
// 其他错误可能是临时故障或反爬，只计数不断言（由 L07 规则区分）。

export interface ExternalCheckResult {
  url: string // 归一化键（与图谱 external.url 对齐）
  status: number | null
  error: 'timeout' | 'dns' | 'blocked_private' | 'other' | 'not_checked' | null
}

export interface ExternalTarget {
  url: string
  href?: string // 原始地址：实际请求它（第二轮独立审查 #6）
}

export const EXTERNAL_CHECK_CAP = 100
export const EXTERNAL_CHECK_BATCH = 25
const EXTERNAL_MAX_REDIRECTS = 3
// 对爬虫普遍拦截（999/403/登录墙）的平台：请求结果不代表链接真实状态，直接跳过不下结论。
export const BOT_HOSTILE_HOSTS = ['linkedin.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com']

const isBotHostile = (host: string) => BOT_HOSTILE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))

// 输入是链接图谱的站外链接：图谱只收本站 HTML 源页的出链，跨站跳转页（第三方 HTML）里的链接不会算到本站头上
// （第二轮独立审查 #4）。去重后按「链到它的不同来源页数」降序选前 cap 个。
export function selectExternalTargets(
  links: Pick<LinkGraphExternal, 'from' | 'url' | 'host' | 'href'>[],
  cap = EXTERNAL_CHECK_CAP,
): { targets: ExternalTarget[]; skippedUrls: number } {
  const sources = new Map<string, Set<string>>()
  const hrefByUrl = new Map<string, string>()
  const skipped = new Set<string>()
  for (const link of links) {
    if (isBotHostile(link.host)) {
      skipped.add(link.url)
      continue
    }
    let s = sources.get(link.url)
    if (!s) sources.set(link.url, (s = new Set()))
    s.add(link.from)
    if (link.href && !hrefByUrl.has(link.url)) hrefByUrl.set(link.url, link.href)
  }
  const targets = [...sources]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, cap)
    .map(([url]) => (hrefByUrl.has(url) ? { url, href: hrefByUrl.get(url)! } : { url }))
  return { targets, skippedUrls: skipped.size }
}

function classifyError(err: unknown): ExternalCheckResult['error'] {
  if (err instanceof SsrfBlockedError) return /blocked private|reserved/i.test(err.message) ? 'blocked_private' : 'other'
  const e = err as { name?: string; code?: string; message?: string }
  if (e?.name === 'AbortError' || /aborted|timed? ?out/i.test(e?.message ?? '')) return 'timeout'
  if (e?.code === 'ENOTFOUND' || e?.code === 'EAI_AGAIN' || /getaddrinfo|ENOTFOUND/.test(e?.message ?? '')) return 'dns'
  return 'other'
}

async function getStatus(url: string, timeoutMs: number, fetchImpl: typeof safeFetch): Promise<number> {
  const res = await fetchImpl(url, { method: 'GET', timeoutMs, maxRedirects: EXTERNAL_MAX_REDIRECTS })
  await res.body?.cancel().catch(() => undefined) // 只要状态码，不下载响应体
  return res.status
}

// HEAD 被拒（403/405/501）时回退 GET：部分站点不支持 HEAD。HEAD 404/410 也用 GET 复核：
// 有服务器对 HEAD 返回 404 而 GET 正常（第二轮独立审查 #5）。
async function checkOne(target: ExternalTarget, timeoutMs: number, fetchImpl: typeof safeFetch): Promise<ExternalCheckResult> {
  const requestUrl = target.href ?? target.url
  try {
    const head = await fetchImpl(requestUrl, { method: 'HEAD', timeoutMs, maxRedirects: EXTERNAL_MAX_REDIRECTS })
    const needsGet = [403, 404, 405, 410, 501].includes(head.status)
    const status = needsGet ? await getStatus(requestUrl, timeoutMs, fetchImpl) : head.status
    return { url: target.url, status, error: null }
  } catch (err) {
    return { url: target.url, status: null, error: classifyError(err) }
  }
}

// 单个 URL 硬超时 + 整批截止时间（第二轮独立审查 #9）：safeFetch 的 DNS 解析与读头之外没有总时长约束，
// 一批 25 个最坏可达数分钟。到截止时间仍未开始的目标记 not_checked，不下结论。
export async function checkExternalLinks(
  targets: ExternalTarget[],
  opts: { concurrency?: number; timeoutMs?: number; deadlineMs?: number } = {},
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<ExternalCheckResult[]> {
  const concurrency = opts.concurrency ?? 8
  const timeoutMs = opts.timeoutMs ?? 8000
  const deadline = Date.now() + (opts.deadlineMs ?? 60_000)
  const out: ExternalCheckResult[] = targets.map((t) => ({ url: t.url, status: null, error: 'not_checked' }))
  let next = 0
  const worker = async () => {
    while (next < targets.length && Date.now() < deadline) {
      const i = next++
      const budget = Math.max(1, Math.min(timeoutMs * 2, deadline - Date.now()))
      let timer: ReturnType<typeof setTimeout> | undefined
      const hardTimeout = new Promise<ExternalCheckResult>((resolve) => {
        timer = setTimeout(() => resolve({ url: targets[i].url, status: null, error: 'timeout' }), budget)
      })
      out[i] = await Promise.race([checkOne(targets[i], timeoutMs, fetchImpl), hardTimeout])
      clearTimeout(timer)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker))
  return out
}
