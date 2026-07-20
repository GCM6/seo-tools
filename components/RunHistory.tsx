import Link from 'next/link'
import { RetestButton } from './RetestButton'
import { isCompletedRunStatus } from '@/lib/runs/status'

export interface RunHistoryItem {
  id: string
  runType: string
  status: string
  startedAt: string | null
  findingCount: number
}

// 项目详情的诊断历史表（i18n-free 纯展示，SP-G1b）。
// 每行 → 该 run 总览页；status=output 时另给报告直达；baseline 且完成态另给「以此回测」
// （spec §2.2），项目处于进行中状态时（hasActiveRun）这些按钮统一禁用（并发保护）。
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
    // 可选：调用方尚未接入时（如仅接收本次改动的 caller 未同步 labels），
    // 新增的「输出」「确认建议」链接直接不渲染，而不是编译期报错或显示英文/占位符。
    viewOutput?: string
    confirmRecs?: string
    noRuns: string
    retestThis: string
    retestStarting: string
    retestError: string
    retestInProgress: string
  }
  statusLabels: Record<string, string>
  runTypeLabels: Record<string, string>
  hasActiveRun?: boolean
}) {
  if (runs.length === 0) return <p className="note">{labels.noRuns}</p>

  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th>{labels.colTime}</th>
            <th>{labels.colType}</th>
            <th>{labels.colStatus}</th>
            <th>{labels.colFindings}</th>
            <th>{labels.colAction}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.startedAt ?? '—'}</td>
              <td>{runTypeLabels[r.runType] ?? r.runType}</td>
              <td>{statusLabels[r.status] ?? r.status}</td>
              <td>{r.findingCount}</td>
              <td>
                <Link href={`/${locale}/runs/${r.id}`}>{labels.viewRun}</Link>
                {r.status === 'output' ? (
                  <>
                    {' · '}
                    <Link href={`/${locale}/runs/${r.id}/report`}>{labels.viewReport}</Link>
                    {labels.viewOutput ? (
                      <>
                        {' · '}
                        <Link href={`/${locale}/runs/${r.id}/output`}>{labels.viewOutput}</Link>
                      </>
                    ) : null}
                  </>
                ) : null}
                {r.status === 'reviewing' && labels.confirmRecs ? (
                  <>
                    {' · '}
                    <Link href={`/${locale}/runs/${r.id}/recommendations`}>{labels.confirmRecs}</Link>
                  </>
                ) : null}
                {r.runType === 'baseline' && isCompletedRunStatus(r.status) ? (
                  <>
                    {' · '}
                    <RetestButton
                      locale={locale}
                      baselineRunId={r.id}
                      labels={{
                        cta: labels.retestThis,
                        starting: labels.retestStarting,
                        error: labels.retestError,
                        inProgress: labels.retestInProgress,
                      }}
                      className="ghost-btn run-btn-sm"
                      disabled={hasActiveRun}
                    />
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
