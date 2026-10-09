import { getFinding, getIssueByFingerprint, getRecommendation, getRun, runIssueAction } from '@/lib/repositories'
import type { IssueRecord } from './types'

// 旧界面桥接（计划 Task 13）：建议页 / 执行清单 / 问题页仍按建议与发现操作，这里把这些操作同步成问题动作。
// 子项目 2 换成问题清单界面后删除本文件。
export interface BridgeDeps {
  getRecommendation: (id: string) => Promise<{ id: string; runId: string; findingId: string } | undefined>
  getFinding: (id: string) => Promise<{ id: string; runId: string; fingerprint: string | null } | undefined>
  getRun: (id: string) => Promise<{ id: string; projectId: string } | undefined>
  getIssueByFingerprint: typeof getIssueByFingerprint
  runIssueAction: typeof runIssueAction
}

const defaultDeps = (): BridgeDeps => ({ getRecommendation, getFinding, getRun, getIssueByFingerprint, runIssueAction })

async function issueForFinding(findingId: string, deps: BridgeDeps): Promise<IssueRecord | undefined> {
  const finding = await deps.getFinding(findingId)
  if (!finding?.fingerprint) return undefined
  const run = await deps.getRun(finding.runId)
  return run ? deps.getIssueByFingerprint(run.projectId, finding.fingerprint) : undefined
}

export async function issueForRecommendation(recId: string, deps: BridgeDeps = defaultDeps()): Promise<IssueRecord | undefined> {
  const rec = await deps.getRecommendation(recId)
  return rec ? issueForFinding(rec.findingId, deps) : undefined
}

const excluded = (i: IssueRecord) => i.decision === 'deferred' || i.decision === 'false_positive'

// 旧界面的写入（建议 / 发现）已经完成；问题动作被拒（action_not_allowed：会覆盖体检核实的结果）时，
// 问题保持体检核实的状态，镜像静默跳过——只吞这一种错误，其余照常抛出。
async function tryIssueAction(deps: BridgeDeps, ...args: Parameters<typeof runIssueAction>): Promise<void> {
  try {
    await deps.runIssueAction(...args)
  } catch (err) {
    if (err instanceof Error && err.message === 'action_not_allowed') return
    throw err
  }
}

export async function mirrorRecommendationStatus(
  recId: string,
  status: 'draft' | 'accepted' | 'edited' | 'rejected',
  deps: BridgeDeps = defaultDeps(),
): Promise<void> {
  const issue = await issueForRecommendation(recId, deps)
  if (!issue) return
  if ((status === 'accepted' || status === 'edited') && issue.decision !== 'included') {
    await tryIssueAction(deps, issue.id, { kind: 'include' }, 'operator', '旧界面：接受建议')
  } else if (status === 'rejected' && !excluded(issue)) {
    await tryIssueAction(deps, issue.id, { kind: 'defer', reason: '旧界面否决（未记录理由）' }, 'operator', undefined)
  }
  // draft：旧界面把建议改回待确认，问题上的决定不变。
}

export async function mirrorRecommendationApplied(recId: string, applied: boolean, note?: string, deps: BridgeDeps = defaultDeps()): Promise<void> {
  const issue = await issueForRecommendation(recId, deps)
  if (!issue) return
  if (applied) {
    if (issue.decision !== 'included') await tryIssueAction(deps, issue.id, { kind: 'include' }, 'operator', '旧界面：接受建议')
    await tryIssueAction(deps, issue.id, { kind: 'execute', note }, 'operator', undefined)
  } else if (issue.executedAt) {
    await tryIssueAction(deps, issue.id, { kind: 'undo_execute' }, 'operator', undefined)
  }
}

export async function mirrorFindingStatus(
  findingId: string,
  status: 'open' | 'dismissed' | 'converted',
  reason?: string,
  deps: BridgeDeps = defaultDeps(),
): Promise<void> {
  const issue = await issueForFinding(findingId, deps)
  if (!issue) return
  if (status === 'dismissed' && issue.decision !== 'false_positive') {
    await tryIssueAction(deps, issue.id, { kind: 'false_positive', reason: reason ?? '旧界面忽略（未记录理由）' }, 'operator', undefined)
  } else if (status === 'open' && excluded(issue)) {
    await tryIssueAction(deps, issue.id, { kind: 'reopen' }, 'operator', undefined)
  }
}
