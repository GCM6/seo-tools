// PSI 纯分析器 —— 把 PsiResult 转成规则输入（findings-input）。
// 不耦合 RuleContext：规则接线在别处完成，本模块只做确定性阈值判定。
//
// 阈值映射 web.dev Core Web Vitals「good」P75 门槛（LCP/INP/CLS）。
// 未来经 reference_artifacts 版本化固化（随 RULES_VERSION）；此处先作为具名常量。

import type { PsiResult } from './psi'

// ── CWV 达标阈值（web.dev CWV「good」上界，P75）────────────────────
export const CWV_LCP_MAX_MS = 2500 // Largest Contentful Paint ≤ 2.5s
export const CWV_INP_MAX_MS = 200 // Interaction to Next Paint ≤ 200ms
export const CWV_CLS_MAX = 0.1 // Cumulative Layout Shift ≤ 0.1

// TTFB 超过此值视为影响抓取预算（Google crawl budget 官方指引：响应速度影响抓取效率）。
export const TTFB_SLOW_MS = 800

export interface CwvFinding {
  metric: 'LCP' | 'INP' | 'CLS'
  value: number
  strategy: string
  passes: boolean
}

/**
 * CWV 达标判定（T09a）。仅在有 CrUX 字段数据时产出 —— 无真实用户数据不下排名结论。
 * @returns 每个可用指标一条；无字段数据时返回空数组（降级到 T09b/T09c）。
 */
export function analyzeCwv(psi: PsiResult): CwvFinding[] {
  if (!psi.crux.hasFieldData) return []

  const out: CwvFinding[] = []
  const { lcpMs, inpMs, cls } = psi.crux

  if (lcpMs !== null) {
    out.push({ metric: 'LCP', value: lcpMs, strategy: psi.strategy, passes: lcpMs <= CWV_LCP_MAX_MS })
  }
  if (inpMs !== null) {
    out.push({ metric: 'INP', value: inpMs, strategy: psi.strategy, passes: inpMs <= CWV_INP_MAX_MS })
  }
  if (cls !== null) {
    out.push({ metric: 'CLS', value: cls, strategy: psi.strategy, passes: cls <= CWV_CLS_MAX })
  }
  return out
}

/**
 * Lighthouse 修复线索（T09b）。返回顶部机会（默认 5 条）。
 * **调用方必须**将其标注为「实验室模拟，非排名输入」—— 本函数不注入排名语义。
 */
export function lighthouseClues(
  psi: PsiResult,
  limit = 5,
): { title: string; savingsMs?: number }[] {
  return psi.lighthouse.opportunities
    .slice(0, limit)
    .map(({ title, savingsMs }) => (savingsMs !== undefined ? { title, savingsMs } : { title }))
}

/**
 * TTFB 抓取预算关注点（T09c）。ttfb>800ms 视为慢（影响抓取效率）。
 * @returns 无 TTFB 数据时返回 null。
 */
export function ttfbConcern(psi: PsiResult): { ttfbMs: number; slow: boolean } | null {
  const { ttfbMs } = psi.lighthouse
  if (ttfbMs === null) return null
  return { ttfbMs, slow: ttfbMs > TTFB_SLOW_MS }
}
