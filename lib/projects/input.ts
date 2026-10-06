import { isValidCategory, isValidKeyword } from '@/lib/repositories/validators'
import { isMarketCode } from '@/lib/markets'

// 项目接口入参校验（SP-A §3.2/§3.3）：POST /projects 与 PATCH /projects/[id] 共用。
// 空品类/空市场允许（向导可能先存草稿），由建 run 闸门最终把关；非空则必须合规。
export interface ProjectTargetingInput {
  industry?: unknown
  market?: unknown
  targetKeywords?: unknown
}

export type ProjectTargeting =
  | { ok: true; industry?: string; market?: string; targetKeywords?: string[] }
  | { ok: false; error: 'invalid_category' | 'invalid_market' | 'invalid_keywords' }

export const MAX_TARGET_KEYWORDS = 20

export function parseProjectTargeting(body: ProjectTargetingInput): ProjectTargeting {
  const out: { ok: true; industry?: string; market?: string; targetKeywords?: string[] } = { ok: true }
  if (body.industry !== undefined) {
    const industry = typeof body.industry === 'string' ? body.industry.trim() : null
    if (industry === null || (industry !== '' && !isValidCategory(industry))) return { ok: false, error: 'invalid_category' }
    out.industry = industry
  }
  if (body.market !== undefined) {
    const market = typeof body.market === 'string' ? body.market.trim() : null
    if (market === null || (market !== '' && !isMarketCode(market))) return { ok: false, error: 'invalid_market' }
    out.market = market
  }
  if (body.targetKeywords !== undefined) {
    const list = body.targetKeywords
    if (!Array.isArray(list) || list.length > MAX_TARGET_KEYWORDS || !list.every((k) => typeof k === 'string' && isValidKeyword(k)))
      return { ok: false, error: 'invalid_keywords' }
    out.targetKeywords = (list as string[]).map((k) => k.trim())
  }
  return out
}
