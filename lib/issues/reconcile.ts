import { deriveStatus } from './status'
import type { IssueEventDraft, IssueFlag, IssueRecord, IssueSeverity, RetiredReason, UnverifiedReason } from './types'

export interface ObservedHit {
  findingId: string
  fingerprint: string
  ruleId: string
  title: string
  pillar: string | null
  side: string
  severity: IssueSeverity
  affectedCount: number | null
}

export interface LedgerEntry {
  ruleId: string
  ruleVersion: number
  outcome: 'hit' | 'clear' | 'not_checked' | 'error'
  reasonKind: 'data_gap' | 'site_condition' | 'unsupported' | 'error' | null
}

export interface ReconcileInput {
  projectId: string
  run: { id: string; startedAt: string; protocolHash: string | null }
  issues: IssueRecord[]
  hits: ObservedHit[]
  ledger: LedgerEntry[]
  protocolBoundRuleIds: ReadonlySet<string>
  // 台账里没有这条规则时：retire = 规则已下线（关闭）；history = 历史回填，旧体检没有台账（未复查）。
  missingLedger: 'retire' | 'history'
  onlyRuleIds?: ReadonlySet<string>
  newIssueId: () => string
  now: string
}

export interface ReconcileOutput {
  issues: IssueRecord[]
  events: IssueEventDraft[]
}

export const observedEventId = (runId: string, issueId: string) => `iev_obs_${runId}_${issueId}`

const RANK: Record<IssueSeverity, number> = { ok: 0, mid: 1, high: 2 }

const withStatus = (i: IssueRecord): IssueRecord => ({ ...i, status: deriveStatus(i) })

// hit = null 表示这次没查（不是「查过没命中」）；变化记录不得声称没做过的检查（spec 4.4-3、6.2）。
function event(input: ReconcileInput, from: IssueRecord | null, next: IssueRecord, checked: boolean, hit: boolean | null, note: string | null): IssueEventDraft {
  return {
    id: observedEventId(input.run.id, next.id),
    issueId: next.id,
    runId: input.run.id,
    kind: 'observed',
    checked,
    hit,
    severity: hit ? next.severity : null,
    affectedCount: hit ? next.affectedCount : null,
    fromStatus: from ? from.status : null,
    toStatus: next.status,
    flags: next.flags,
    note,
    actor: 'system',
    createdAt: input.now,
  }
}

function observedFields(input: ReconcileInput, h: ObservedHit, ruleVersion: number) {
  return {
    detection: 'present' as const,
    severity: h.severity,
    affectedCount: h.affectedCount,
    title: h.title,
    pillar: h.pillar,
    side: h.side,
    latestFindingId: h.findingId,
    ruleVersion,
    protocolHash: input.run.protocolHash,
    lastSeenRunId: input.run.id,
    lastCheckedRunId: input.run.id,
    lastCheckedAt: input.run.startedAt,
    retiredReason: null,
    unverifiedReason: null,
    updatedAt: input.now,
  }
}

function applyHit(input: ReconcileInput, issue: IssueRecord, h: ObservedHit, entry: LedgerEntry | undefined) {
  const flags: IssueFlag[] = []
  let note: string | null = null
  let { decision, decisionReason, decidedAt, decidedBy, executedAt, executedNote, executedBy } = issue
  const clearExecution = () => {
    executedAt = null
    executedNote = null
    executedBy = null
  }
  if (issue.retiredReason) {
    // 4.4-8：关闭后在新口径下再命中，按新出现处理；已纳入的回到待执行。不再比较新旧数值。
    flags.push('new')
    if (decision === 'included') clearExecution()
  } else {
    // 4.4-5：复发要求问题此前确实是已修复 / 自行消失。检测值是 gone 但状态仍是「已执行待复查」
    // （执行晚于那次体检开始）或「已排除」的，再命中不是复发。已纳入的回到待执行（执行历史留在变化记录）。
    const prev = deriveStatus(issue)
    if (prev === 'fixed' || prev === 'self_resolved') {
      flags.push('relapse')
      if (decision === 'included') clearExecution()
    }
    // 4.3 / 4.4-6/7：数值（严重度、受影响数）只在同一口径下才能比较。
    const versionChanged = entry !== undefined && entry.ruleVersion !== issue.ruleVersion
    // 故意用严格 !==：两边都为空（历史回放）算同一口径；一边为空一边有值算变了（未知与已知不可比）。
    const protocolChanged = input.protocolBoundRuleIds.has(issue.ruleId) && issue.protocolHash !== input.run.protocolHash
    if (!versionChanged && !protocolChanged) {
      if (RANK[h.severity] > RANK[issue.severity]) {
        flags.push('worse')
        // 4.4-4：暂不处理的问题变严重 → 退回待处理；误报不退回。
        if (decision === 'deferred') {
          decision = 'pending'
          decisionReason = null
          decidedAt = null
          decidedBy = null
        }
      }
      if (issue.detection === 'present' && h.affectedCount !== null && issue.affectedCount !== null && h.affectedCount < issue.affectedCount) {
        flags.push('partial')
        // 4.4-10：变化记录写「5 → 2」。
        note = `${issue.affectedCount} → ${h.affectedCount}`
      }
    } else {
      if (protocolChanged) flags.push('protocol_changed')
      if (versionChanged) flags.push('rule_changed')
    }
  }
  const next = withStatus({
    ...issue,
    ...observedFields(input, h, entry?.ruleVersion ?? issue.ruleVersion),
    decision,
    decisionReason,
    decidedAt,
    decidedBy,
    executedAt,
    executedNote,
    executedBy,
    flags,
  })
  return { issue: next, event: event(input, issue, next, true, true, note) }
}

function unverified(input: ReconcileInput, issue: IssueRecord, reason: UnverifiedReason) {
  // 4.4-3：没查 / 出错 → 检测值与检查时间都不动，状态不变，只加标记与原因。
  const next = withStatus({ ...issue, flags: ['unverified'], unverifiedReason: reason, updatedAt: input.now })
  return { issue: next, event: event(input, issue, next, false, null, reason) }
}

// checked = false：规则根本没被评估（台账里没有这条规则，已下线）——不动检查时间 / 协议 / 版本，变化记录写未查。
// checked = true：规则评估过且没命中，只是口径变了（协议 / 版本）——检查时间移到本次，变化记录写查过没命中。
function retire(input: ReconcileInput, issue: IssueRecord, reason: RetiredReason, entry: LedgerEntry | undefined, checked: boolean) {
  // 4.4-6 / 4.4-7：新口径下没命中 → 关闭，不算修复；排除优先（deriveStatus 里 excluded 先于 retired）。
  const next = withStatus({
    ...issue,
    retiredReason: reason,
    flags: [reason],
    unverifiedReason: null,
    ...(checked
      ? {
          ruleVersion: entry?.ruleVersion ?? issue.ruleVersion,
          protocolHash: input.run.protocolHash,
          lastCheckedRunId: input.run.id,
          lastCheckedAt: input.run.startedAt,
        }
      : {}),
    updatedAt: input.now,
  })
  return { issue: next, event: event(input, issue, next, checked, checked ? false : null, reason) }
}

function applyMiss(input: ReconcileInput, issue: IssueRecord, entry: LedgerEntry | undefined) {
  if (!entry) {
    return input.missingLedger === 'history' ? unverified(input, issue, 'history_no_ledger') : retire(input, issue, 'rule_changed', undefined, false)
  }
  if (entry.outcome === 'not_checked') return unverified(input, issue, entry.reasonKind ?? 'unsupported')
  if (entry.outcome === 'error') return unverified(input, issue, 'error')
  // 5.1-3：协议先于版本。严格 !== 的含义同 applyHit（两边都为空 = 同一口径，一边为空 = 变了）。
  if (input.protocolBoundRuleIds.has(issue.ruleId) && issue.protocolHash !== input.run.protocolHash) {
    return retire(input, issue, 'protocol_changed', entry, true)
  }
  if (entry.ruleVersion !== issue.ruleVersion) return retire(input, issue, 'rule_changed', entry, true)
  const next = withStatus({
    ...issue,
    detection: 'gone',
    flags: [],
    unverifiedReason: null,
    lastCheckedRunId: input.run.id,
    lastCheckedAt: input.run.startedAt,
    updatedAt: input.now,
  })
  return { issue: next, event: event(input, issue, next, true, false, null) }
}

function createIssue(input: ReconcileInput, h: ObservedHit, entry: LedgerEntry | undefined) {
  const next = withStatus({
    id: input.newIssueId(),
    projectId: input.projectId,
    fingerprint: h.fingerprint,
    ruleId: h.ruleId,
    decision: 'pending',
    decisionReason: null,
    decidedAt: null,
    decidedBy: null,
    executedAt: null,
    executedNote: null,
    executedBy: null,
    status: 'pending',
    flags: ['new'],
    firstSeenRunId: input.run.id,
    createdAt: input.now,
    ...observedFields(input, h, entry?.ruleVersion ?? 1),
  })
  return { issue: next, event: event(input, null, next, true, true, null) }
}

// 对账（spec 2026-10-09 §5.1）：问题现状 + 本次命中 + 台账 → 问题表更新与变化记录。纯函数。
export function reconcileIssues(input: ReconcileInput): ReconcileOutput {
  const inScope = (ruleId: string) => !input.onlyRuleIds || input.onlyRuleIds.has(ruleId)
  const ledgerByRule = new Map(input.ledger.map((e) => [e.ruleId, e]))
  const hitsByFp = new Map<string, ObservedHit>()
  for (const h of input.hits) {
    if (!inScope(h.ruleId)) continue
    const prev = hitsByFp.get(h.fingerprint)
    if (!prev || RANK[h.severity] > RANK[prev.severity]) hitsByFp.set(h.fingerprint, h)
  }

  const out: ReconcileOutput = { issues: [], events: [] }
  const push = (r: { issue: IssueRecord; event: IssueEventDraft }) => {
    out.issues.push(r.issue)
    out.events.push(r.event)
  }
  const known = new Set<string>()
  for (const issue of input.issues) {
    if (!inScope(issue.ruleId)) continue
    known.add(issue.fingerprint)
    // 同一次体检里，问题第一次被查过的观测为准：局部对账（竞品确认后重算）与 Inngest 重试会对同一次体检再对账，
    // 第二遍拿到的是这次自己刚写下的值，会让 新出现 / 复发 / 变严重 / 部分改善 消失，并把唯一的观测记录的「来自状态」覆盖成本次结果。
    // 本次没能查的（未复查、规则已下线而关闭）不会移动 lastCheckedRunId，所以仍会被正常观测。
    // 已知缺口：规则已下线而关闭的问题，第二遍的变化记录「来自状态」会变成已关闭（未复查不改状态，不受影响）。
    if (issue.lastCheckedRunId === input.run.id) continue
    const h = hitsByFp.get(issue.fingerprint)
    const entry = ledgerByRule.get(issue.ruleId)
    push(h ? applyHit(input, issue, h, entry) : applyMiss(input, issue, entry))
  }
  for (const [fp, h] of hitsByFp) {
    if (!known.has(fp)) push(createIssue(input, h, ledgerByRule.get(h.ruleId)))
  }
  return out
}
