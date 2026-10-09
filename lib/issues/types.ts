// 问题台账类型（spec 2026-10-09 §4、§6）。与 db/schema.ts 的 issues / issue_events 逐列对应。
export type IssueSeverity = 'high' | 'mid' | 'ok'
export type IssueDecision = 'pending' | 'included' | 'deferred' | 'false_positive'
export type IssueDetection = 'present' | 'gone'
export type IssueStatus =
  | 'pending'
  | 'to_execute'
  | 'executed_awaiting'
  | 'fixed'
  | 'not_effective'
  | 'self_resolved'
  | 'excluded'
  | 'retired'
export type IssueFlag = 'new' | 'worse' | 'relapse' | 'partial' | 'unverified' | 'protocol_changed' | 'rule_changed'
export type UnverifiedReason = 'data_gap' | 'site_condition' | 'unsupported' | 'error' | 'history_no_ledger'
export type RetiredReason = 'protocol_changed' | 'rule_changed'
export type HumanActor = 'operator' | 'owner'
export type EventActor = 'system' | HumanActor

export interface IssueRecord {
  id: string
  projectId: string
  fingerprint: string
  ruleId: string
  ruleVersion: number
  pillar: string | null
  side: string
  title: string
  severity: IssueSeverity
  affectedCount: number | null
  latestFindingId: string | null
  decision: IssueDecision
  decisionReason: string | null
  decidedAt: string | null
  decidedBy: HumanActor | null
  executedAt: string | null
  executedNote: string | null
  executedBy: HumanActor | null
  detection: IssueDetection
  status: IssueStatus
  flags: IssueFlag[]
  unverifiedReason: UnverifiedReason | null
  retiredReason: RetiredReason | null
  protocolHash: string | null
  firstSeenRunId: string | null
  lastSeenRunId: string | null
  lastCheckedRunId: string | null
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface IssueEventDraft {
  id: string
  issueId: string
  runId: string | null
  kind: 'observed' | 'decision' | 'execution'
  checked: boolean | null
  hit: boolean | null
  severity: IssueSeverity | null
  affectedCount: number | null
  fromStatus: IssueStatus | null
  toStatus: IssueStatus
  flags: IssueFlag[]
  note: string | null
  actor: EventActor
  createdAt: string
}
