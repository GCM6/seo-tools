import type { RunStatus } from '@/lib/types'

// 诊断工作区抬头的纯逻辑（ux-blueprint §3）：进度条状态、主动作、编号与域名显示。
// 纯函数，无 IO，便于单测；RunWorkspace（Server Component）负责取数后调用。

export interface RecCounts {
  total: number
  /** 待确认（draft） */
  draft: number
  /** 已接受或已编辑（可进入执行清单） */
  decided: number
  /** 已标记执行（applied_at 不为空） */
  applied: number
}

export type LifeStepKey = 'collect' | 'diagnose' | 'review' | 'execute' | 'retest'
export type LifeStepState = 'done' | 'current' | 'todo' | 'failed'
export interface LifeStep {
  key: LifeStepKey
  state: LifeStepState
  /** 形如「15/15」的进度计数，只在确认建议、执行两步出现 */
  count?: string
}

// 历史兼容（沿用旧 Shell 的规则）：reviewing 状态但建议已全部处理过，按 output 显示，
// 避免老 run 永远停在「确认建议」这一步。
export function effectiveStatus(status: RunStatus, recs: RecCounts): RunStatus {
  if (status === 'reviewing' && recs.total > 0 && recs.draft === 0) return 'output'
  return status
}

export function lifecycleSteps(status: RunStatus, recs: RecCounts): LifeStep[] {
  const s = effectiveStatus(status, recs)
  const reviewCount = recs.total > 0 ? `${recs.total - recs.draft}/${recs.total}` : undefined
  const executeCount = recs.decided > 0 ? `${recs.applied}/${recs.decided}` : undefined
  const step = (key: LifeStepKey, state: LifeStepState, count?: string): LifeStep => (count ? { key, state, count } : { key, state })

  switch (s) {
    case 'failed':
      // 失败发生在哪个阶段无法从 RunStatus 判定，抬头只标「未完成」，失败原因由页面主体的进度面板说明。
      return [step('collect', 'failed'), step('diagnose', 'todo'), step('review', 'todo'), step('execute', 'todo'), step('retest', 'todo')]
    case 'draft':
    case 'collecting':
      return [step('collect', 'current'), step('diagnose', 'todo'), step('review', 'todo'), step('execute', 'todo'), step('retest', 'todo')]
    case 'collected':
    case 'diagnosing':
      return [step('collect', 'done'), step('diagnose', 'current'), step('review', 'todo'), step('execute', 'todo'), step('retest', 'todo')]
    case 'reviewing':
      return [step('collect', 'done'), step('diagnose', 'done'), step('review', 'current', reviewCount), step('execute', 'todo'), step('retest', 'todo')]
    case 'output':
      return [
        step('collect', 'done'),
        step('diagnose', 'done'),
        step('review', 'done', reviewCount),
        step('execute', 'current', executeCount),
        step('retest', 'todo'),
      ]
  }
}

export type NextAction = { kind: 'review'; pending: number } | { kind: 'execute' } | null

// 抬头唯一的主动作（每个视图只放 1 个 primary，design-system §4 Button）。
export function nextAction(status: RunStatus, recs: RecCounts): NextAction {
  const s = effectiveStatus(status, recs)
  if (s === 'reviewing') return { kind: 'review', pending: recs.draft }
  if (s === 'output') return { kind: 'execute' }
  return null
}

/** 诊断是否已产出可看的结果（可分享报告、可发起回测）。 */
export function isRunFinished(status: RunStatus): boolean {
  return status === 'reviewing' || status === 'output'
}

/** run_05face85-9769-… → 05face85，用于报告编号与抬头。 */
export function runShortId(runId: string): string {
  const m = /^run_([0-9a-f]{8})/i.exec(runId)
  return m ? m[1] : runId.slice(0, 8)
}

/** https://metadocu.com/ → metadocu.com；解析失败原样返回去掉协议的字符串。 */
export function displayDomain(domain: string): string {
  try {
    return new URL(domain).host.replace(/^www\./, '')
  } catch {
    return domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}
