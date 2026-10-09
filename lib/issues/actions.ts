import { deriveStatus } from './status'
import type { HumanActor, IssueEventDraft, IssueRecord } from './types'

export type IssueAction =
  | { kind: 'include' }
  | { kind: 'defer'; reason: string }
  | { kind: 'false_positive'; reason: string }
  | { kind: 'reopen' }
  | { kind: 'execute'; note?: string }
  | { kind: 'undo_execute' }

// 人对问题的动作（spec 2026-10-09 §4.2「可做的动作」）。纯函数：返回新问题与一条变化记录，非法动作抛 snake_case 错误。
export function applyIssueAction(
  issue: IssueRecord,
  action: IssueAction,
  ctx: { actor: HumanActor; now: string; eventId: string; note?: string },
): { issue: IssueRecord; event: IssueEventDraft } {
  let next: IssueRecord = { ...issue, updatedAt: ctx.now }
  let kind: IssueEventDraft['kind'] = 'decision'
  let note: string | null = ctx.note ?? null
  const clearExecution = { executedAt: null, executedNote: null, executedBy: null }

  switch (action.kind) {
    case 'include':
      next = { ...next, decision: 'included', decisionReason: null, decidedAt: ctx.now, decidedBy: ctx.actor }
      break
    case 'defer':
    case 'false_positive': {
      if (issue.status === 'fixed') throw new Error('action_not_allowed')
      const reason = (action.reason ?? '').trim()
      if (!reason) throw new Error('reason_required')
      next = {
        ...next,
        ...clearExecution,
        decision: action.kind === 'defer' ? 'deferred' : 'false_positive',
        decisionReason: reason,
        decidedAt: ctx.now,
        decidedBy: ctx.actor,
      }
      note = note ?? reason
      break
    }
    case 'reopen':
      if (issue.decision !== 'deferred' && issue.decision !== 'false_positive') throw new Error('not_excluded')
      next = { ...next, decision: 'pending', decisionReason: null, decidedAt: null, decidedBy: null }
      break
    case 'execute': {
      if (issue.decision !== 'included') throw new Error('not_included')
      if (issue.status === 'fixed') throw new Error('action_not_allowed')
      const executedNote = action.note?.trim() || null
      next = { ...next, executedAt: ctx.now, executedNote, executedBy: ctx.actor }
      kind = 'execution'
      note = note ?? executedNote
      break
    }
    case 'undo_execute':
      if (!issue.executedAt) throw new Error('not_executed')
      if (issue.status !== 'executed_awaiting') throw new Error('action_not_allowed')
      next = { ...next, ...clearExecution }
      kind = 'execution'
      break
    default:
      throw new Error('unknown_action')
  }

  next = { ...next, status: deriveStatus(next) }
  return {
    issue: next,
    event: {
      id: ctx.eventId,
      issueId: issue.id,
      runId: null,
      kind,
      checked: null,
      hit: null,
      severity: null,
      affectedCount: null,
      fromStatus: issue.status,
      toStatus: next.status,
      flags: next.flags,
      note,
      actor: ctx.actor,
      createdAt: ctx.now,
    },
  }
}
