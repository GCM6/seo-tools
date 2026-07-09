import Link from 'next/link'
import { RetestButton } from './RetestButton'

// 项目列表行摘要（SP-G1b），形状对齐 repositories.listProjectsWithSummary。
export interface ProjectSummaryItem {
  id: string
  domain: string
  market: string
  nextRetestDueAt: string | null
  latestRun: { id: string; runType: string; status: string; startedAt: string | null; findingCount: number } | null
  // 重新分析三态判定所需（spec §2.1 修订）：进行中 run / 可回测的锚点 baseline。
  activeRun: { id: string; status: string } | null
  retestAnchor: { id: string } | null
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
    colAction: string
    empty: string
    noRun: string
    retestNone: string
    findingsUnit: (count: number) => string
    actionRunning: string
    actionRetest: string
    actionReconfigure: string
    actionConfigure: string
    retestStarting: string
    retestError: string
    retestInProgress: string
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
                <th>{labels.colAction}</th>
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
                    <td>
                      {p.activeRun ? (
                        <Link href={`/${locale}/runs/${p.activeRun.id}`}>{labels.actionRunning}</Link>
                      ) : p.retestAnchor ? (
                        <span className="list-actions">
                          <RetestButton
                            locale={locale}
                            baselineRunId={p.retestAnchor.id}
                            labels={{
                              cta: labels.actionRetest,
                              starting: labels.retestStarting,
                              error: labels.retestError,
                              inProgress: labels.retestInProgress,
                            }}
                          />
                          <Link href={`/${locale}/new?projectId=${p.id}`} className="ghost-btn">
                            {labels.actionReconfigure}
                          </Link>
                        </span>
                      ) : (
                        <Link href={`/${locale}/new?projectId=${p.id}`} className="run-btn">
                          {labels.actionConfigure}
                        </Link>
                      )}
                    </td>
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
