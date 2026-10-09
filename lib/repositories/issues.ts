import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { checkResults, issueEvents, issues, projects } from '@/db/schema'
import type { LedgerRow } from '@/lib/diagnosis/check-ledger'
import type { IssueEventDraft, IssueRecord, IssueStatus, RetiredReason, HumanActor } from '@/lib/issues/types'
import { applyIssueAction, type IssueAction } from '@/lib/issues/actions'

// 问题台账读写（spec 2026-10-09 §6）。经 lib/repositories/index.ts 的 export * 暴露。

export const RETEST_WINDOW_DAYS = 28

// 行 → 领域记录：CHECK 约束保证枚举取值合法，这里只做类型收窄。
const toRecord = (row: typeof issues.$inferSelect): IssueRecord => row as unknown as IssueRecord

export const getProjectIssues = async (projectId: string): Promise<IssueRecord[]> =>
  (await db.select().from(issues).where(eq(issues.projectId, projectId))).map(toRecord)

export const getIssue = async (id: string): Promise<IssueRecord | undefined> => {
  const row = await db.query.issues.findFirst({ where: eq(issues.id, id) })
  return row ? toRecord(row) : undefined
}

export const getIssueByFingerprint = async (projectId: string, fingerprint: string): Promise<IssueRecord | undefined> => {
  const row = await db.query.issues.findFirst({ where: and(eq(issues.projectId, projectId), eq(issues.fingerprint, fingerprint)) })
  return row ? toRecord(row) : undefined
}

// 单事务写入：对账或人工动作的结果要么全部落库，要么一条都不落（失败由 Inngest 重试）。
export async function saveIssueChanges(changes: { issues: IssueRecord[]; events: IssueEventDraft[] }): Promise<void> {
  if (!changes.issues.length && !changes.events.length) return
  await db.transaction(async (tx) => {
    for (const row of changes.issues) {
      await tx.insert(issues).values(row).onConflictDoUpdate({ target: issues.id, set: row })
    }
    for (const row of changes.events) {
      // spec §6.2：issue_events 追加语义；仅 'observed' 事件幂等覆盖，其他 kind 只插不更新。
      if (row.kind === 'observed') {
        await tx.insert(issueEvents).values(row).onConflictDoUpdate({ target: issueEvents.id, set: row })
      } else {
        await tx.insert(issueEvents).values(row).onConflictDoNothing({ target: issueEvents.id })
      }
    }
  })
}

export const hasObservedEvents = async (runId: string): Promise<boolean> => {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(issueEvents)
    .where(and(eq(issueEvents.runId, runId), eq(issueEvents.kind, 'observed')))
  return (row?.n ?? 0) > 0
}

export async function saveCheckLedger(runId: string, rows: LedgerRow[]): Promise<void> {
  if (!rows.length) return
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .insert(checkResults)
        .values({ id: `chk_${crypto.randomUUID()}`, runId, ...r })
        .onConflictDoUpdate({
          target: [checkResults.runId, checkResults.ruleId],
          set: { ruleVersion: r.ruleVersion, outcome: r.outcome, reasonKind: r.reasonKind, reason: r.reason, hitCount: r.hitCount },
        })
    }
  })
}

export const getRunCheckLedger = (runId: string) => db.select().from(checkResults).where(eq(checkResults.runId, runId))

// 复查提醒（spec §5.4-2）：最早一条「已执行，待复查」的执行时间 + 28 天；没有则清空。
export async function recomputeRetestDue(projectId: string): Promise<string | null> {
  const rows = await db
    .select({ executedAt: issues.executedAt })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), eq(issues.status, 'executed_awaiting')))
  const times = rows.map((r) => Date.parse(r.executedAt ?? 'invalid')).filter((t) => Number.isFinite(t))
  const due = times.length ? new Date(Math.min(...times) + RETEST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString() : null
  await db.update(projects).set({ nextRetestDueAt: due }).where(eq(projects.id, projectId))
  return due
}

export interface RunIssueSummary {
  total: number
  byStatus: Partial<Record<IssueStatus, number>>
  newCount: number
  worseCount: number
  relapseCount: number
  partialCount: number
  unverifiedCount: number
  closed: {
    protocolChanged: number
    ruleChanged: number
    // 曾经已纳入（可能已向站主承诺）的关闭问题逐条列出（spec §5.2）。
    committed: { issueId: string; title: string; reason: RetiredReason; executed: boolean }[]
  }
}

// 体检变化摘要（spec §5.2）：由该体检的 observed 变化记录汇总。
export async function getRunIssueSummary(runId: string): Promise<RunIssueSummary> {
  const rows = await db
    .select({ event: issueEvents, issue: issues })
    .from(issueEvents)
    .innerJoin(issues, eq(issueEvents.issueId, issues.id))
    .where(and(eq(issueEvents.runId, runId), eq(issueEvents.kind, 'observed')))
  const s: RunIssueSummary = {
    total: rows.length,
    byStatus: {},
    newCount: 0,
    worseCount: 0,
    relapseCount: 0,
    partialCount: 0,
    unverifiedCount: 0,
    closed: { protocolChanged: 0, ruleChanged: 0, committed: [] },
  }
  for (const { event, issue } of rows) {
    const to = event.toStatus as IssueStatus
    s.byStatus[to] = (s.byStatus[to] ?? 0) + 1
    const flags = event.flags ?? []
    if (flags.includes('new')) s.newCount += 1
    if (flags.includes('worse')) s.worseCount += 1
    if (flags.includes('relapse')) s.relapseCount += 1
    if (flags.includes('partial')) s.partialCount += 1
    if (flags.includes('unverified')) s.unverifiedCount += 1
    if (to === 'retired' && event.fromStatus !== 'retired') {
      const reason = event.note as RetiredReason
      if (reason === 'protocol_changed') s.closed.protocolChanged += 1
      if (reason === 'rule_changed') s.closed.ruleChanged += 1
      if (issue.decision === 'included') {
        s.closed.committed.push({ issueId: issue.id, title: issue.title, reason, executed: issue.executedAt !== null })
      }
    }
  }
  return s
}

export interface IssueTodos {
  pending: number
  pendingNew: number
  pendingWorse: number
  notEffective: number
}

// 你需要处理的（spec §5.2）：待处理（其中新出现、变严重）与改了没生效。
export async function getProjectIssueTodos(projectId: string): Promise<IssueTodos> {
  const rows = await getProjectIssues(projectId)
  const pending = rows.filter((r) => r.status === 'pending')
  return {
    pending: pending.length,
    pendingNew: pending.filter((r) => r.flags.includes('new')).length,
    pendingWorse: pending.filter((r) => r.flags.includes('worse')).length,
    notEffective: rows.filter((r) => r.status === 'not_effective').length,
  }
}

// 单个问题的人工动作：写问题 + 变化记录（同一事务），再重算复查提醒。
export async function runIssueAction(issueId: string, action: IssueAction, actor: HumanActor = 'operator', note?: string): Promise<IssueRecord> {
  const issue = await getIssue(issueId)
  if (!issue) throw new Error('not_found')
  const { issue: next, event } = applyIssueAction(issue, action, { actor, now: new Date().toISOString(), eventId: `iev_${crypto.randomUUID()}`, note })
  await saveIssueChanges({ issues: [next], events: [event] })
  await recomputeRetestDue(issue.projectId)
  return next
}

// 「剩下的全部纳入」（spec D5）：只处理状态为待处理的问题。
export async function includeRemaining(projectId: string, actor: HumanActor = 'operator'): Promise<number> {
  const pending = (await getProjectIssues(projectId)).filter((i) => i.status === 'pending')
  if (!pending.length) return 0
  const now = new Date().toISOString()
  const changes = pending.map((i) =>
    applyIssueAction(i, { kind: 'include' }, { actor, now, eventId: `iev_${crypto.randomUUID()}`, note: '剩下的全部纳入' }),
  )
  await saveIssueChanges({ issues: changes.map((c) => c.issue), events: changes.map((c) => c.event) })
  await recomputeRetestDue(projectId)
  return changes.length
}
