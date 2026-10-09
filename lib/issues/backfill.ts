import { applyIssueAction, type IssueAction } from './actions'
import { reconcileIssues, toObservedHit, type ObservedHit } from './reconcile'
import type { IssueEventDraft, IssueRecord } from './types'

// 历史回填（spec 2026-10-09 §6.5-2）：按时间顺序重放已完成体检，并补上当时的人工决定。纯函数。
export interface ReplayInput {
  projectId: string
  runs: { id: string; status: string; startedAt: string | null; finishedAt: string | null }[]
  findings: {
    id: string
    runId: string
    fingerprint: string | null
    ruleId: string | null
    title: string
    pillar: string | null
    side: string
    severity: string
    status: string
    dismissReason: string | null
    detail?: { scale: { affected: number | null } } | null
  }[]
  recommendations: { id: string; runId: string; findingId: string; status: string; appliedAt: string | null; appliedNote: string | null }[]
  newIssueId: () => string
  newEventId: () => string
}

const COMPLETED = new Set(['reviewing', 'output'])
const timeOf = (r: { startedAt: string | null; finishedAt: string | null }) => r.startedAt ?? r.finishedAt ?? ''
const msOf = (r: { startedAt: string | null; finishedAt: string | null }) => Date.parse(timeOf(r)) || 0

export function replayHistory(input: ReplayInput): { issues: IssueRecord[]; events: IssueEventDraft[] } {
  // 同一时间的体检按 id 排，保证每次回放顺序一致（数据库返回顺序不作保证）。
  const runs = input.runs
    .filter((r) => COMPLETED.has(r.status) && timeOf(r))
    .sort((a, b) => msOf(a) - msOf(b) || a.id.localeCompare(b.id))
  const issues = new Map<string, IssueRecord>()
  const events: IssueEventDraft[] = []
  const byFp = () => new Map([...issues.values()].map((i) => [i.fingerprint, i]))

  const act = (issue: IssueRecord, action: IssueAction, now: string) => {
    const { issue: next, event } = applyIssueAction(issue, action, { actor: 'operator', now, eventId: input.newEventId(), note: '历史回填' })
    issues.set(next.id, next)
    events.push(event)
  }

  for (const run of runs) {
    const at = timeOf(run)
    const runFindings = input.findings.filter((f) => f.runId === run.id)
    const out = reconcileIssues({
      projectId: input.projectId,
      run: { id: run.id, startedAt: at, protocolHash: null },
      issues: [...issues.values()],
      hits: runFindings.map(toObservedHit).filter((h): h is ObservedHit => h !== null),
      ledger: [],
      protocolBoundRuleIds: new Set(),
      missingLedger: 'history',
      newIssueId: input.newIssueId,
      now: run.finishedAt ?? at,
    })
    for (const i of out.issues) issues.set(i.id, i)
    events.push(...out.events)

    const decidedAt = run.finishedAt ?? at
    const fpOfFinding = new Map(runFindings.map((f) => [f.id, f.fingerprint]))
    // 先补建议上的决定，再补发现上的「忽略」——误报优先于否决。
    for (const rec of input.recommendations.filter((r) => r.runId === run.id)) {
      const fp = fpOfFinding.get(rec.findingId)
      const issue = fp ? byFp().get(fp) : undefined
      if (!issue) continue
      if ((rec.status === 'accepted' || rec.status === 'edited') && issue.decision !== 'included') act(issue, { kind: 'include' }, decidedAt)
      if (rec.status === 'rejected' && issue.decision !== 'deferred' && issue.decision !== 'false_positive') {
        act(issue, { kind: 'defer', reason: '历史数据：否决时未记录理由' }, decidedAt)
      }
      const current = byFp().get(fp as string)!
      // 与 retest-delta 同口径：建议自己是已接受 / 已修改，且标过已执行，才算执行过（待确认 / 已否决的建议带着 applied_at 不算）。
      const gatePassed = rec.status === 'accepted' || rec.status === 'edited'
      if (gatePassed && rec.appliedAt && current.decision === 'included') act(current, { kind: 'execute', note: rec.appliedNote ?? undefined }, rec.appliedAt)
    }
    for (const f of runFindings.filter((x) => x.status === 'dismissed')) {
      const issue = f.fingerprint ? byFp().get(f.fingerprint) : undefined
      if (issue && issue.decision !== 'false_positive') {
        act(issue, { kind: 'false_positive', reason: f.dismissReason?.trim() || '历史数据：忽略时未记录理由' }, decidedAt)
      }
    }
  }
  return { issues: [...issues.values()], events }
}

// 回填专用的事件 id 生成器：同一次回填里严格递增且可按字典序排序（零填充序号 + 随机后缀防撞）。
// 回填把同一次体检恢复出的多条决定写成同一个 createdAt，文档里只能靠事件 id 还原它们的先后。
export function backfillEventIds(): () => string {
  let seq = 0
  return () => `iev_bf_${String(++seq).padStart(6, '0')}_${crypto.randomUUID().slice(0, 8)}`
}
