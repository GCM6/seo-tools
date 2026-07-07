// 进度故事线纯模型。客户端安全：不 import @inngest/realtime（镜像其消息形状）。
export type PhaseKey = 'discover' | 'light_check' | 'cluster' | 'deep_check' | 'probes' | 'diagnose'
export const PHASES: PhaseKey[] = ['discover', 'light_check', 'cluster', 'deep_check', 'probes', 'diagnose']

export type EvidenceStreamType =
  | 'serp_snapshot' | 'page_fetch' | 'schema' | 'render_check' | 'ai_answer' | 'sitemap' | 'site_audit'
  | 'psi' | 'gsc' | 'dataforseo_serp' | 'dataforseo_labs' | 'dataforseo_backlinks' | 'ua_probe' | 'third_party_presence'

export type ProgressMessage =
  | { type: 'progress'; pct: number }
  | { type: 'evidence_created'; evidenceType: EvidenceStreamType }
  | { type: 'phase'; phase: PhaseKey; checked?: number; total?: number; pillar?: string; findings?: number }
  | { type: 'done' }
  | { type: 'failed'; reason: string }

export interface StagelineState {
  status: 'collecting' | 'collected' | 'failed'
  pct: number
  currentPhase: PhaseKey | null
  completed: PhaseKey[]
  phaseProgress: { checked: number; total: number } | null
  findings: number
  counts: Partial<Record<EvidenceStreamType, number>>
  lastEvent: { evidenceType: EvidenceStreamType } | null
  reason: string
}

export function initialStagelineState(status: string, failureReason = ''): StagelineState {
  const done = status === 'collected' || status === 'diagnosing' || status === 'reviewing' || status === 'output'
  return {
    status: status === 'failed' ? 'failed' : done ? 'collected' : 'collecting',
    pct: done ? 100 : status === 'collecting' ? 8 : 0,
    currentPhase: null,
    completed: [],
    phaseProgress: null,
    findings: 0,
    counts: {},
    lastEvent: null,
    reason: failureReason,
  }
}

export function reduceProgress(state: StagelineState, msg: ProgressMessage): StagelineState {
  switch (msg.type) {
    case 'progress':
      return { ...state, pct: msg.pct }
    case 'phase': {
      const idx = PHASES.indexOf(msg.phase)
      const changed = state.currentPhase !== msg.phase
      const hasProg = typeof msg.checked === 'number' && typeof msg.total === 'number'
      return {
        ...state,
        currentPhase: msg.phase,
        completed: idx >= 0 ? PHASES.slice(0, idx) : state.completed,
        // 换相位重置计数；本事件自带 checked/total 则采用。
        phaseProgress: hasProg ? { checked: msg.checked!, total: msg.total! } : changed ? null : state.phaseProgress,
        findings: typeof msg.findings === 'number' ? msg.findings : state.findings,
      }
    }
    case 'evidence_created':
      return {
        ...state,
        counts: { ...state.counts, [msg.evidenceType]: (state.counts[msg.evidenceType] ?? 0) + 1 },
        lastEvent: { evidenceType: msg.evidenceType },
      }
    case 'done':
      return { ...state, status: 'collected', pct: 100, currentPhase: null, completed: [...PHASES] }
    case 'failed':
      return { ...state, status: 'failed', reason: msg.reason }
  }
}
