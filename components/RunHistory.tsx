import Link from 'next/link'

export interface RunHistoryItem {
  id: string
  runType: string
  status: string
  startedAt: string | null
  findingCount: number
}

// 项目详情的诊断历史表（i18n-free 纯展示，SP-G1b）。
// 每行 → 该 run 总览页；status=output 时另给报告直达。
export function RunHistory({
  locale,
  runs,
  labels,
  statusLabels,
  runTypeLabels,
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
    noRuns: string
  }
  statusLabels: Record<string, string>
  runTypeLabels: Record<string, string>
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
