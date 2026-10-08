'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, ButtonLink } from './Button'
import { EmptyState } from './EmptyState'
import { RetestButton } from './RetestButton'
import { FaviconImage } from './FaviconImage'
import { LocalTime } from './LocalTime'
import { RelativeDate } from './RelativeDate'
import { displayDomain } from '@/lib/runs/workspace'

// 项目列表行摘要（SP-G1b），形状对齐 repositories.listProjectsWithSummary。
export interface ProjectSummaryItem {
  id: string
  domain: string
  market: string
  gscReady: boolean
  nextRetestDueAt: string | null
  latestRun: {
    id: string
    runType: string
    status: string
    startedAt: string | null
    finishedAt?: string | null
    findingCount: number
  } | null
  // 重新分析三态判定所需（spec §2.1 修订）：进行中 run / 可回测的锚点 baseline。
  activeRun: { id: string; status: string } | null
  retestAnchor: { id: string } | null
}

// 项目表格（ux-blueprint §2.1）：搜索 → 表格。行 = 域名 · 市场 · 最近诊断（类型 · 状态 + 时间）·
// 发现数 · GSC · 下次复查 · 行内操作。variant="compact" 用在首页：只列前 10 个、不带搜索和操作列。
// i18n-free：文案全部由调用方传入。
export function ProjectList({
  locale,
  projects,
  labels,
  statusLabels,
  runTypeLabels,
  variant = 'full',
}: {
  locale: string
  projects: ProjectSummaryItem[]
  labels: {
    newAnalysis: string
    colDomain: string
    colMarket: string
    colLatest: string
    colFindings: string
    colGsc: string
    colRetest: string
    colAction: string
    empty: string
    emptyHint: string
    noRun: string
    retestNone: string
    findingsUnit: string
    actionRunning: string
    actionRetest: string
    actionReconfigure: string
    actionConfigure: string
    retestStarting: string
    retestError: string
    retestInProgress: string
    // SP-A §3.5：建 run 闸门拒绝时链到向导补充的文案（可选，缺省回落 retestError）。
    retestNeedsSetup?: string
    searchLabel: string
    searchPlaceholder: string
    searchEmpty: string
    clearSearch: string
    gscConnected: string
    gscPending: string
  }
  statusLabels: Record<string, string>
  runTypeLabels: Record<string, string>
  variant?: 'full' | 'compact'
}) {
  const [query, setQuery] = useState('')
  const compact = variant === 'compact'
  const q = query.trim().toLowerCase()
  const filtered = q ? projects.filter((p) => displayDomain(p.domain).toLowerCase().includes(q)) : projects
  const rows = compact ? filtered.slice(0, 10) : filtered

  if (projects.length === 0) {
    return (
      <div className="ui-panel">
        <EmptyState
          title={labels.empty}
          description={labels.emptyHint}
          action={
            <ButtonLink href={`/${locale}/new`} variant="primary" size="sm">
              {labels.newAnalysis}
            </ButtonLink>
          }
        />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {compact ? null : (
        <div className="ui-list-toolbar">
          <input
            type="search"
            className="ui-input ui-list-toolbar__search"
            aria-label={labels.searchLabel}
            placeholder={labels.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ButtonLink href={`/${locale}/new`}>{labels.newAnalysis}</ButtonLink>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="ui-panel">
          <EmptyState
            title={labels.searchEmpty.replace('{query}', query.trim())}
            action={
              <Button size="sm" onClick={() => setQuery('')}>
                {labels.clearSearch}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="ui-panel ui-table-wrap">
          <table className="ui-table ui-table--nowrap">
            <thead>
              <tr>
                <th>{labels.colDomain}</th>
                <th>{labels.colMarket}</th>
                <th>{labels.colLatest}</th>
                <th className="ui-num">{labels.colFindings}</th>
                <th>{labels.colGsc}</th>
                <th>{labels.colRetest}</th>
                {compact ? null : (
                  <th>
                    <span className="sr-only">{labels.colAction}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const run = p.latestRun
                const runTime = run ? run.startedAt ?? run.finishedAt ?? null : null
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="ui-project-cell">
                        <FaviconImage domain={p.domain} />
                        <Link href={`/${locale}/projects/${p.id}`} className="ui-mono">
                          {displayDomain(p.domain)}
                        </Link>
                      </span>
                    </td>
                    <td className="ui-cell-muted">{p.market}</td>
                    <td>
                      {run ? (
                        <span className="ui-stack-xs">
                          <span>{`${runTypeLabels[run.runType] ?? run.runType} · ${statusLabels[run.status] ?? run.status}`}</span>
                          {runTime ? (
                            <span className="ui-footnote">
                              <LocalTime iso={runTime} />
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="ui-muted">{labels.noRun}</span>
                      )}
                    </td>
                    <td className="ui-num">{run ? labels.findingsUnit.replace('{count}', String(run.findingCount)) : '—'}</td>
                    <td className={p.gscReady ? undefined : 'ui-muted'}>{p.gscReady ? labels.gscConnected : labels.gscPending}</td>
                    <td>{p.nextRetestDueAt ? <RelativeDate iso={p.nextRetestDueAt} locale={locale} /> : <span className="ui-muted">{labels.retestNone}</span>}</td>
                    {compact ? null : (
                      <td>
                        <span className="ui-row-actions">
                          {p.activeRun ? (
                            <ButtonLink href={`/${locale}/runs/${p.activeRun.id}`} size="sm" variant="quiet">
                              {labels.actionRunning}
                            </ButtonLink>
                          ) : p.retestAnchor ? (
                            <>
                              <RetestButton
                                locale={locale}
                                baselineRunId={p.retestAnchor.id}
                                className="ui-btn ui-btn--sm"
                                labels={{
                                  cta: labels.actionRetest,
                                  starting: labels.retestStarting,
                                  error: labels.retestError,
                                  inProgress: labels.retestInProgress,
                                  needsSetup: labels.retestNeedsSetup,
                                }}
                              />
                              <ButtonLink href={`/${locale}/new?projectId=${p.id}`} size="sm" variant="quiet">
                                {labels.actionReconfigure}
                              </ButtonLink>
                            </>
                          ) : (
                            <ButtonLink href={`/${locale}/new?projectId=${p.id}`} size="sm">
                              {labels.actionConfigure}
                            </ButtonLink>
                          )}
                        </span>
                      </td>
                    )}
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
