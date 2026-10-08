import Link from 'next/link'
import { EmptyState } from './EmptyState'
import { LocalTime } from './LocalTime'
import { RetestButton } from './RetestButton'
import { isCompletedRunStatus } from '@/lib/runs/status'

export interface RunHistoryItem {
  id: string
  runType: string
  status: string
  startedAt: string | null
  finishedAt?: string | null
  findingCount: number
}

// 项目详情的诊断历史表（ux-blueprint §2.2，i18n-free 纯展示）。
// 时间优先 started_at，回落 finished_at，两者都没有写「时间未记录」。
// 每行 → 该 run 总览页；output 另给报告 / 执行清单直达；reviewing 给「确认建议」；
// baseline 且完成态给「以这次为基线回测」，项目有进行中的诊断（hasActiveRun）时禁用（并发保护）。
export function RunHistory({
  locale,
  runs,
  labels,
  statusLabels,
  runTypeLabels,
  hasActiveRun = false,
}: {
  locale: string
  runs: RunHistoryItem[]
  labels: {
    colTime: string
    colType: string
    colStatus: string
    colFindings: string
    colAction: string
    viewRun: string
    viewReport: string
    // 可选：调用方尚未接入时，这两个链接直接不渲染，而不是显示占位符。
    viewOutput?: string
    confirmRecs?: string
    noRuns: string
    /** 开始、完成时间都没有时显示；缺省为「—」。 */
    timeUnknown?: string
    retestThis: string
    retestStarting: string
    retestError: string
    retestInProgress: string
    // SP-A §3.5：建 run 闸门拒绝时链到向导补充的文案（可选，缺省回落 retestError）。
    retestNeedsSetup?: string
  }
  statusLabels: Record<string, string>
  runTypeLabels: Record<string, string>
  hasActiveRun?: boolean
}) {
  if (runs.length === 0) {
    return (
      <div className="ui-panel">
        <EmptyState title={labels.noRuns} />
      </div>
    )
  }

  return (
    <div className="ui-panel ui-table-wrap">
      <table className="ui-table ui-table--nowrap">
        <thead>
          <tr>
            <th>{labels.colTime}</th>
            <th>{labels.colType}</th>
            <th>{labels.colStatus}</th>
            <th className="ui-num">{labels.colFindings}</th>
            <th>
              <span className="sr-only">{labels.colAction}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const time = r.startedAt ?? r.finishedAt ?? null
            return (
              <tr key={r.id}>
                <td>{time ? <LocalTime iso={time} /> : <span className="ui-muted">{labels.timeUnknown ?? '—'}</span>}</td>
                <td>{runTypeLabels[r.runType] ?? r.runType}</td>
                <td className={r.status === 'failed' ? 'ui-cell-danger' : undefined}>{statusLabels[r.status] ?? r.status}</td>
                <td className="ui-num">{r.findingCount}</td>
                <td>
                  <span className="ui-row-actions">
                    <Link href={`/${locale}/runs/${r.id}`}>{labels.viewRun}</Link>
                    {r.status === 'output' ? (
                      <>
                        <Link href={`/${locale}/runs/${r.id}/report`}>{labels.viewReport}</Link>
                        {labels.viewOutput ? <Link href={`/${locale}/runs/${r.id}/output`}>{labels.viewOutput}</Link> : null}
                      </>
                    ) : null}
                    {r.status === 'reviewing' && labels.confirmRecs ? (
                      <Link href={`/${locale}/runs/${r.id}/recommendations`}>{labels.confirmRecs}</Link>
                    ) : null}
                    {r.runType === 'baseline' && isCompletedRunStatus(r.status) ? (
                      <RetestButton
                        locale={locale}
                        baselineRunId={r.id}
                        labels={{
                          cta: labels.retestThis,
                          starting: labels.retestStarting,
                          error: labels.retestError,
                          inProgress: labels.retestInProgress,
                          needsSetup: labels.retestNeedsSetup,
                        }}
                        className="ui-btn ui-btn--sm"
                        disabled={hasActiveRun}
                      />
                    ) : null}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
