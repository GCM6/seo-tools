import { isValidCategory } from '@/lib/repositories/validators'
import { findMarket } from '@/lib/markets'

// 建 run 闸门（SP-A §3.5）：品类/市场无效时不得建 run、不得派发采集（也就不触发任何付费采集）。
// 所有入口共用：POST /api/runs、/runs/[id]/retest、/runs/[id]/retry、两个 analysis-sessions 入口。
export type RunGateError = 'category_required' | 'market_required'

export function runGateError(project: { industry?: string | null; market?: string | null }): RunGateError | null {
  if (!isValidCategory(project.industry ?? '')) return 'category_required'
  if (!findMarket(project.market ?? '')) return 'market_required'
  return null
}

// 分析会话入口：会话补充的合规值覆盖项目上无效的旧值（否则旧项目永远过不了闸门）；
// 仍无效时返回要补充的字段名，由会话回到 waiting_input，复用既有的补充输入界面。
export function resolveSessionRunGate(
  project: { industry?: string | null; market?: string | null },
  intake: { industry?: string | null; market?: string | null },
): { projectPatch: { industry?: string; market?: string; language: 'en' }; gate: RunGateError | null; missingFields: string[] } {
  const projectPatch: { industry?: string; market?: string; language: 'en' } = { language: 'en' }
  const intakeIndustry = (intake.industry ?? '').trim()
  const intakeMarket = (intake.market ?? '').trim()
  if (!isValidCategory(project.industry ?? '') && isValidCategory(intakeIndustry)) projectPatch.industry = intakeIndustry
  if (!findMarket(project.market ?? '') && findMarket(intakeMarket)) projectPatch.market = intakeMarket
  const effective = { industry: projectPatch.industry ?? project.industry, market: projectPatch.market ?? project.market }
  const missingFields: string[] = []
  if (!isValidCategory(effective.industry ?? '')) missingFields.push('industry')
  if (!findMarket(effective.market ?? '')) missingFields.push('market')
  return { projectPatch, gate: runGateError(effective), missingFields }
}
