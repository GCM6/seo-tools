// GEO 采集器 —— 社交/评价站前台存在度。
//
// 定位（GEO 支柱：品牌是否已进入 YouTube 与第三方评价站的前台可见语料）：
//   复用 collect-evidence 已配置的 Google CSE 通道（searchVisibilityProvider），对品牌名分别在
//   YouTube、G2、Trustpilot、Capterra 四个平台发 `site:<domain> "<brand>"` 查询，统计前台索引
//   命中数与前几条结果。与 serp_snapshot 同一 CSE 前台可见性口径 —— 一律 L2，不得标 L3/L4
//   （见 collect-evidence.ts serp_snapshot 判例）。
//
// 本模块是自包含纯采集器：不落库、不耦合 RuleContext。search 函数由调用方注入（复用已配置的
// CSE provider，免二次 BYOK 配置），任一平台查询失败按该平台空结果降级，绝不抛出
// （third-party-presence.ts 同款降级策略）。

// ── 严格等于的返回契约（勿改字段）─────────────────────────────────
export interface SocialPresenceSearchResult {
  resultCount: number
  results: { title: string; link: string }[]
}

// 调用方注入的查询函数：复用已配置 CSE provider 的 search()，本模块不关心凭据/HTTP 细节。
export type SocialPresenceSearchFn = (query: string) => Promise<SocialPresenceSearchResult>

export type SocialPresencePlatform = 'youtube' | 'g2' | 'trustpilot' | 'capterra'

export interface SocialPresencePlatformResult {
  platform: SocialPresencePlatform
  query: string
  resultCount: number
  topResults: { title: string; url: string }[]
}

export interface SocialPresenceResult {
  brand: string
  platforms: SocialPresencePlatformResult[]
  checkedAt: string
}

export interface SocialPresenceInput {
  brand: string
}

const PLATFORM_DOMAINS: { platform: SocialPresencePlatform; domain: string }[] = [
  { platform: 'youtube', domain: 'youtube.com' },
  { platform: 'g2', domain: 'g2.com' },
  { platform: 'trustpilot', domain: 'trustpilot.com' },
  { platform: 'capterra', domain: 'capterra.com' },
]

// 未命中/失败时的中性降级值。
const EMPTY_TOP_RESULTS: { title: string; url: string }[] = []

function buildQuery(domain: string, brand: string): string {
  return `site:${domain} "${brand}"`
}

/**
 * 单平台查询：查询失败（限流/网络错误）→ 降级为 resultCount:0, topResults:[]，绝不抛出。
 */
async function checkPlatform(
  platform: SocialPresencePlatform,
  domain: string,
  brand: string,
  search: SocialPresenceSearchFn,
): Promise<SocialPresencePlatformResult> {
  const query = buildQuery(domain, brand)
  try {
    const { resultCount, results } = await search(query)
    return {
      platform,
      query,
      resultCount,
      // 只取前 3 条作为可展示样本，完整命中数仍看 resultCount。
      topResults: results.slice(0, 3).map((r) => ({ title: r.title, url: r.link })),
    }
  } catch {
    return { platform, query, resultCount: 0, topResults: EMPTY_TOP_RESULTS }
  }
}

/**
 * 社交/评价站前台存在度采集入口：并行查询四个平台，任一平台失败仅该平台降级，不影响其他平台。
 * @param search 已配置的 CSE 查询函数（调用方注入，如 collect-evidence 里的 searchVisibilityProvider.search）
 */
export async function checkSocialPresence(
  input: SocialPresenceInput,
  search: SocialPresenceSearchFn,
): Promise<SocialPresenceResult> {
  const platforms = await Promise.all(
    PLATFORM_DOMAINS.map(({ platform, domain }) => checkPlatform(platform, domain, input.brand, search)),
  )
  return { brand: input.brand, platforms, checkedAt: new Date().toISOString() }
}
