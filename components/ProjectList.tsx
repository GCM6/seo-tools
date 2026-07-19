'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RetestButton } from './RetestButton'
import { FaviconImage } from './FaviconImage'

// 项目列表行摘要（SP-G1b），形状对齐 repositories.listProjectsWithSummary。
export interface ProjectSummaryItem {
  id: string
  domain: string
  market: string
  gscReady: boolean
  nextRetestDueAt: string | null
  latestRun: { id: string; runType: string; status: string; startedAt: string | null; findingCount: number } | null
  // 重新分析三态判定所需（spec §2.1 修订）：进行中 run / 可回测的锚点 baseline。
  activeRun: { id: string; status: string } | null
  retestAnchor: { id: string } | null
}

function CalendarIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '12px', height: '12px', display: 'inline-block' }}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function formatRelativeTime(dateStr: string | null, locale: string, fallback: string): string {
  if (!dateStr) return fallback
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    const isZh = locale === 'zh'

    if (Math.abs(diffDays) === 0) {
      return isZh ? '今天' : 'Today'
    }

    if (diffDays > 0) {
      if (diffDays === 1) return isZh ? '明天' : 'Tomorrow'
      if (diffDays === 2) return isZh ? '后天' : 'In 2 days'
      return isZh ? `${diffDays} 天后` : `In ${diffDays} days`
    } else {
      const absDays = Math.abs(diffDays)
      if (absDays === 1) return isZh ? '昨天' : 'Yesterday'
      if (absDays === 2) return isZh ? '前天' : '2 days ago'
      return isZh ? `${absDays} 天前` : `${absDays} days ago`
    }
  } catch {
    return dateStr
  }
}

// 项目列表：卡片网格重构（带搜索过滤与相对时间）
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
    findingsUnit: string
    actionRunning: string
    actionRetest: string
    actionReconfigure: string
    actionConfigure: string
    retestStarting: string
    retestError: string
    retestInProgress: string
    projectManagement: string
    searchPlaceholder: string
    marketLabel: string
    retestLabel: string
    latestStatusLabel: string
    findingsDetectedLabel: string
    gscConnected: string
    gscPending: string
  }
  statusLabels: Record<string, string>
  runTypeLabels: Record<string, string>
}) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProjects = projects.filter((p) =>
    p.domain.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="projects-wrap">
      {/* 搜索与工具栏 */}
      <div className="projects-toolbar">
        <h1 className="projects-title">
          {labels.projectManagement}
        </h1>
        <div className="projects-search-wrapper">
          <input
            type="text"
            placeholder={labels.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="projects-search-input"
          />
          <Link href={`/${locale}/new`} className="run-btn" style={{ marginTop: 0 }}>
            {labels.newAnalysis}
          </Link>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="card text-center" style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <svg style={{ width: '48px', height: '48px', color: 'var(--ds-muted)', opacity: 0.6 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p style={{ fontSize: '14px', color: 'var(--ds-body)', margin: 0 }}>{labels.empty}</p>
        </div>
      ) : (
        <div className="projects-grid p-4">
          {filteredProjects.map((p) => {
            const run = p.latestRun
            const hasFindings = run && run.findingCount > 0

            return (
              <div key={p.id} className="card project-card">
                {/* 卡片头部：域名与市场标签 */}
                <div className="project-card-header">
                  {/* Favicon 标志，提供真实站点感 */}
                  <FaviconImage domain={p.domain} />
                  <div className="project-card-title-group">
                    <Link href={`/${locale}/projects/${p.id}`} className="project-card-domain">
                      {p.domain}
                    </Link>
                    <div className="project-card-meta">
                      <span className="project-card-meta-item">
                        {p.market} {labels.marketLabel}
                      </span>
                      <span className={`project-card-meta-item ${p.gscReady ? 'text-success' : 'text-muted'}`}>
                        <span className={`status-indicator-dot ${p.gscReady ? 'active' : 'inactive'}`} />
                        {p.gscReady ? labels.gscConnected : labels.gscPending}
                      </span>
                      <span className="project-card-meta-item project-card-meta-retest">
                        <CalendarIcon />
                        {labels.retestLabel} {formatRelativeTime(p.nextRetestDueAt, locale, labels.retestNone)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 卡片中部：诊断状态与缺陷警告 */}
                <div className="project-stats-bay">
                  <div className="project-stat-cell">
                    <span className="project-stat-label">{labels.latestStatusLabel}</span>
                    <span className="project-stat-value">
                      <span className={`status-indicator-dot ${run ? 'active' : 'inactive'}`} />
                      {run
                        ? `${runTypeLabels[run.runType] ?? run.runType} · ${statusLabels[run.status] ?? run.status}`
                        : labels.noRun}
                    </span>
                  </div>
                  <div className="project-stat-cell">
                    <span className="project-stat-label">{labels.findingsDetectedLabel}</span>
                    <span className={`project-stat-value findings ${hasFindings ? 'gap' : 'good'}`}>
                      {run ? (
                        <>
                          <span className="findings-indicator-dot" />
                          {labels.findingsUnit.replace('{count}', String(run.findingCount))}
                        </>
                      ) : (
                        <span style={{ color: 'var(--ds-muted)', fontWeight: 'normal' }}>—</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* 卡片底部：操作与分析按钮 */}
                <div className="project-card-actions">
                  <div className="project-card-actions-wrapper">
                    {p.activeRun ? (
                      <Link href={`/${locale}/runs/${p.activeRun.id}`} className="run-btn run-btn-sm">
                        <span style={{ display: 'inline-flex', position: 'relative', width: '8px', height: '8px' }}>
                          <span style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', backgroundColor: '#fff', opacity: 0.75 }} className="animate-ping"></span>
                          <span style={{ position: 'relative', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#fff' }} className="theme-indicator"></span>
                        </span>
                        {labels.actionRunning}
                      </Link>
                    ) : p.retestAnchor ? (
                      <>
                        <RetestButton
                          locale={locale}
                          baselineRunId={p.retestAnchor.id}
                          className="run-btn run-btn-sm"
                          labels={{
                            cta: labels.actionRetest,
                            starting: labels.retestStarting,
                            error: labels.retestError,
                            inProgress: labels.retestInProgress,
                          }}
                        />
                        <Link href={`/${locale}/new?projectId=${p.id}`} className="ghost-config-link">
                          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '14px', height: '14px', display: 'inline-block' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {labels.actionReconfigure}
                        </Link>
                      </>
                    ) : (
                      <Link href={`/${locale}/new?projectId=${p.id}`} className="run-btn run-btn-sm">
                        {labels.actionConfigure}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
