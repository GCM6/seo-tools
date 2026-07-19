import { setRequestLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { listProjectsWithSummary } from '@/lib/repositories'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'
import { summarizeDataSourceHealth } from '@/lib/settings/data-source-health'
import { getDataSourceConnectHref, isExternalConnectHref } from '@/lib/settings/connect-links'
import { FaviconImage } from '@/components/FaviconImage'

export const dynamic = 'force-dynamic'

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [tSettings, tProjects, tDashboard, projects, dataHealth] = await Promise.all([
    getTranslations('settings'),
    getTranslations('projects'),
    getTranslations('dashboard'),
    listProjectsWithSummary(),
    loadDataSourceStatuses().then(summarizeDataSourceHealth),
  ])

  const recentProjects = projects.slice(0, 3)

  // 数据源多语言对应字典
  const sourceNames: Record<string, string> = {
    googleCse: tSettings('source.googleCse'),
    aiProbe: tSettings('source.aiProbe'),
    dataforseo: tSettings('source.dataforseo'),
    render: tSettings('source.render'),
  }

  // 补齐多语言翻译字典，防止 ReferenceError 崩溃
  const statusLabels = tProjects.raw('status') as Record<string, string>
  const runTypeLabels = tProjects.raw('runType') as Record<string, string>

  return (
    <div className="dashboard-hub animate-slide-up">
      {/* 1. 顶端欢迎 Banner */}
      <div className="welcome-banner">
        {/* 顺时针自旋流光束 */}
        <div className="welcome-banner-trail" />

        {/* 内容内胆层 */}
        <div className="welcome-banner-inner">
          {/* 科技精密网格层 */}
          <div className="welcome-banner-grid-overlay" />

          <div className="welcome-banner-content">
            <span className="welcome-banner-sub">
              <span className="ai-pulse-dot" />
              {tDashboard('welcomeSub')}
            </span>
            <h1 className="welcome-banner-title">
              {tDashboard('welcomeTitle')}
            </h1>
            <p className="welcome-banner-desc">
              {tDashboard('welcomeDesc')}
            </p>
            <div>
              <Link
                href={`/${locale}/new`}
                className="welcome-banner-cta"
              >
                <span className="arrow">➔</span>
                {tDashboard('welcomeCta').replace('➔', '').trim()}
              </Link>
            </div>
          </div>
          {/* 背景虚化装饰元素 */}
          <div className="welcome-banner-decor" />
        </div>
      </div>

      {/* 2. 主区域两栏布局 */}
      <div className="dashboard-main">

        {/* 左栏：项目管理 / Onboarding 引导 */}
        <div className="dashboard-column">
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">
              {tDashboard('recentProjects')}
            </h2>
            {projects.length > 0 && (
              <Link
                href={`/${locale}/projects`}
                className="dashboard-section-link"
              >
                {tDashboard('viewAllProjects')}
              </Link>
            )}
          </div>

          {projects.length === 0 ? (
            /* Onboarding 空态引导卡片 */
            <div className="card onboarding-card">
              <div className="onboarding-icon-container">
                <svg style={{ width: '24px', height: '24px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px 0' }}>
                  {tDashboard('onboardingTitle')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--ds-muted)', lineHeight: 1.6, margin: '0 auto', maxWidth: '420px' }}>
                  {tDashboard('onboardingDesc')}
                </p>
              </div>

              {/* 三步卡片 */}
              <div className="onboarding-steps-grid">
                <div className="onboarding-step-card">
                  <div className="onboarding-step-number">01</div>
                  <h4 className="onboarding-step-title">{tDashboard('step1Title')}</h4>
                  <p className="onboarding-step-desc">
                    {tDashboard('step1Desc')}
                  </p>
                </div>
                <div className="onboarding-step-card">
                  <div className="onboarding-step-number">02</div>
                  <h4 className="onboarding-step-title">{tDashboard('step2Title')}</h4>
                  <p className="onboarding-step-desc">
                    {tDashboard('step2Desc')}
                  </p>
                </div>
                <div className="onboarding-step-card">
                  <div className="onboarding-step-number">03</div>
                  <h4 className="onboarding-step-title">{tDashboard('step3Title')}</h4>
                  <p className="onboarding-step-desc">
                    {tDashboard('step3Desc')}
                  </p>
                </div>
              </div>

              <Link href={`/${locale}/new`} className="run-btn">
                {tProjects('newAnalysis')}
              </Link>
            </div>
          ) : (
            /* 最近项目卡片列表 */
            <div className="projects-list-grid">
              {recentProjects.map((p) => {
                const run = p.latestRun
                const hasFindings = run && run.findingCount > 0

                return (
                  <Link
                    key={p.id}
                    href={`/${locale}/projects/${p.id}`}
                    className="card project-card interactive"
                  >
                    <div>
                      <div className="project-card-header">
                        <FaviconImage domain={p.domain} />
                        <span className="project-card-title">
                          {p.domain}
                        </span>
                      </div>
                      <div className="project-card-market-row">
                        <span className="project-card-market-tag">
                          {p.market}
                        </span>
                      </div>
                    </div>

                    <div className="project-stats-bay">
                      <div className="project-stat-cell">
                        <span className="project-stat-label">{tDashboard('recentRunLabel')}</span>
                        <span className="project-stat-value">
                          <span className={`status-indicator-dot ${run ? 'active' : 'inactive'}`} />
                          {run ? `${runTypeLabels[run.runType] ?? run.runType} · ${statusLabels[run.status] ?? run.status}` : tProjects('noRun')}
                        </span>
                      </div>
                      <div className="project-stat-cell">
                        <span className="project-stat-label">{tDashboard('findingsLabel')}</span>
                        <span className={`project-stat-value findings ${hasFindings ? 'gap' : 'good'}`}>
                          {run ? (
                            <>
                              <span className="findings-indicator-dot" />
                              {tProjects('findingsUnit', { count: run.findingCount })}
                            </>
                          ) : (
                            <span style={{ color: 'var(--ds-muted)', fontWeight: 'normal' }}>—</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* 右栏：全局系统健康度概览 */}
        <div className="dashboard-column">
          <h2 className="dashboard-section-title">
            {tSettings('matrixTitle')}
          </h2>
          <div className="card health-overview-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--ds-muted)' }}>
                {tDashboard('readinessLabel')}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  background: 'var(--ds-primary-muted)',
                  color: 'var(--ds-primary)',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}
              >
                {dataHealth.up} / {dataHealth.total}
              </span>
            </div>

            {/* 健康度进度条 */}
            <div className="health-overview-bar-container">
              <div
                className="health-overview-bar"
                style={{
                  width: `${(dataHealth.up / dataHealth.total) * 100}%`
                }}
              />
            </div>

            {/* 数据源列表明细 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
              {dataHealth.items.map((item) => {
                const name = sourceNames[item.key] ?? item.key
                const connectHref = getDataSourceConnectHref(item.key, locale)
                const opensExternal = isExternalConnectHref(connectHref)

                return (
                  <div key={item.key} className="source-item">
                    <span className="source-name">{name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className={`source-status-badge ${item.up ? 'connected' : 'disconnected'}`}
                      >
                        {item.up
                          ? (item.key === 'gsc' ? tSettings('statusConnected') : tSettings('statusConfigured'))
                          : (item.key === 'gsc' ? tSettings('statusNotConnected') : tSettings('statusNotConfigured'))}
                      </span>
                      {!item.up && (opensExternal ? (
                        <a
                          href={connectHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '11px', textDecoration: 'none', color: 'var(--ds-primary)' }}
                        >
                          {tDashboard('setupAction')}
                        </a>
                      ) : (
                        <Link
                          href={connectHref}
                          style={{ fontSize: '11px', textDecoration: 'none', color: 'var(--ds-primary)' }}
                        >
                          {tDashboard('setupAction')}
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
