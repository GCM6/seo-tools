// GEO 采集器 —— 社交/评价站前台存在度。
//
// 定位（GEO 支柱：品牌是否已进入 YouTube 与第三方评价站的前台可见语料）：
//   复用 collect-evidence 已配置的 Google CSE 通道（searchVisibilityProvider），对品牌名分别在
//   YouTube、G2、Trustpilot、Capterra 四个平台发 `site:<domain> "<brand>"` 查询，统计前台索引
//   命中数与前几条结果。与 serp_snapshot 同一 CSE 前台可见性口径 —— 一律 L2，不得标 L3/L4
//   （见 collect-evidence.ts serp_snapshot 判例）。
//
// 本模块是自包含纯采集器：不落库、不耦合 RuleContext。search 函数由调用方注入（复用已配置的
// CSE provider，免二次 BYOK 配置）。任一平台查询失败如实标 status:'failed' + 原因（SP-A §4.4），
// 不再降级成"0 条结果"，也不抛出；规则只认 status === 'ok' 的平台。

import { reasonOf, type RawResponse } from './result'

// ── 严格等于的返回契约（勿改字段）─────────────────────────────────
export interface SocialPresenceSearchResult {
  resultCount: number
  results: { title: string; link: string }[]
  // 响应原文（可选）：CSE provider 会带上，由采集段存档。
  raw?: RawResponse
}

// 调用方注入的查询函数：复用已配置 CSE provider 的 search()，本模块不关心凭据/HTTP 细节。
export type SocialPresenceSearchFn = (query: string) => Promise<SocialPresenceSearchResult>

export type SocialPresencePlatform = 'youtube' | 'g2' | 'trustpilot' | 'capterra'

export interface SocialPresencePlatformResult {
  platform: SocialPresencePlatform
  query: string
  // ok = 查询成功（resultCount 是测得值）；failed = 查询失败（resultCount 恒 0，不可当"没有"解读）。
  status: 'ok' | 'failed'
  reason?: string
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

export interface SocialPresenceOutcome {
  payload: SocialPresenceResult
  // 有响应（不论成败）的平台原文，由编排层存入 evidence_raw。
  raws: { platform: SocialPresencePlatform; raw: RawResponse }[]
}

const PLATFORM_DOMAINS: { platform: SocialPresencePlatform; domain: string }[] = [
  { platform: 'youtube', domain: 'youtube.com' },
  { platform: 'g2', domain: 'g2.com' },
  { platform: 'trustpilot', domain: 'trustpilot.com' },
  { platform: 'capterra', domain: 'capterra.com' },
]

// 平台顺序即子阶段 social_presence:<平台> 的顺序（报告文案覆盖测试据此比对）。
export const SOCIAL_PLATFORMS: SocialPresencePlatform[] = PLATFORM_DOMAINS.map((p) => p.platform)

// 未命中/失败时的中性降级值。
const EMPTY_TOP_RESULTS: { title: string; url: string }[] = []

function buildQuery(domain: string, brand: string): string {
  return `site:${domain} "${brand}"`
}

/**
 * 单平台查询：失败（限流/网络/非 JSON）→ status:'failed' + 原因，绝不抛出；错误带原文时一并返回供存档。
 */
async function checkPlatform(
  platform: SocialPresencePlatform,
  domain: string,
  brand: string,
  search: SocialPresenceSearchFn,
): Promise<{ result: SocialPresencePlatformResult; raw: RawResponse | null }> {
  const query = buildQuery(domain, brand)
  try {
    const { resultCount, results, raw } = await search(query)
    return {
      result: {
        platform,
        query,
        status: 'ok',
        resultCount,
        // 只取前 3 条作为可展示样本，完整命中数仍看 resultCount。
        topResults: results.slice(0, 3).map((r) => ({ title: r.title, url: r.link })),
      },
      raw: raw ?? null,
    }
  } catch (err) {
    const raw = err && typeof err === 'object' ? ((err as { raw?: RawResponse }).raw ?? null) : null
    return { result: { platform, query, status: 'failed', reason: reasonOf(err), resultCount: 0, topResults: EMPTY_TOP_RESULTS }, raw }
  }
}

/**
 * 社交/评价站前台存在度采集入口：并行查询四个平台，各平台独立判定 ok / failed，互不影响。
 * @param search 已配置的 CSE 查询函数（调用方注入，如 collect-evidence 里的 searchVisibilityProvider.search）
 */
export async function checkSocialPresence(
  input: SocialPresenceInput,
  search: SocialPresenceSearchFn,
): Promise<SocialPresenceOutcome> {
  const checks = await Promise.all(
    PLATFORM_DOMAINS.map(({ platform, domain }) => checkPlatform(platform, domain, input.brand, search)),
  )
  const raws: SocialPresenceOutcome['raws'] = []
  for (const c of checks) if (c.raw) raws.push({ platform: c.result.platform, raw: c.raw })
  return {
    payload: { brand: input.brand, platforms: checks.map((c) => c.result), checkedAt: new Date().toISOString() },
    raws,
  }
}
