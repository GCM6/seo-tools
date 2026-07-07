import Link from 'next/link'

// 项目列表行摘要（SP-G1b），形状对齐 repositories.listProjectsWithSummary。
export interface ProjectSummaryItem {
  id: string
  domain: string
  market: string
  nextRetestDueAt: string | null
  latestRun: { id: string; runType: string; status: string; startedAt: string | null; findingCount: number } | null
}

// 项目列表（i18n-free 纯展示）：调用方 t() 后传入已翻译 label 与状态映射。
// 行链接 /<locale>/projects/<id>；「新建分析」→ /<locale>/new。Server Component 可直接渲染。
export function ProjectList({
  locale,
  projects,
  labels,
  statusLabels,
  runTypeLabels,
}: {
  locale: string
  projects: ProjectSummaryItem[]
  labels: {
    newAnalysis: string
    colDomain: string
    colLatest: string
    colFindings: string
    colRetest: string
    empty: string
    noRun: string
    retestNone: string
    findingsUnit: (count: number) => string
  }
  statusLabels: Record<string, string>
  runTypeLabels: Record<string, string>
}) {
  return (
    <div className="projects-wrap">
      <div className="projects-toolbar">
        <Link href={`/${locale}/new`} className="run-btn">
          {labels.newAnalysis}
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="note">{labels.empty}</p>
      ) : (
        <div className="report-table-wrap">
          <table className="report-table projects-table">
            <thead>
              <tr>
                <th>{labels.colDomain}</th>
                <th>{labels.colLatest}</th>
                <th>{labels.colFindings}</th>
                <th>{labels.colRetest}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const run = p.latestRun
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/${locale}/projects/${p.id}`} className="mono projects-domain">
                        {p.domain}
                      </Link>
                    </td>
                    <td>
                      {run
                        ? `${runTypeLabels[run.runType] ?? run.runType} · ${statusLabels[run.status] ?? run.status}`
                        : labels.noRun}
                    </td>
                    <td>{run ? labels.findingsUnit(run.findingCount) : '—'}</td>
                    <td className="mono">{p.nextRetestDueAt ?? labels.retestNone}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
