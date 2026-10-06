import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Shell } from '@/components/Shell'
import { SitePageActions } from '@/components/SitePageActions'
import { EmptyStateCTA } from '@/components/EmptyStateCTA'
import { Term } from '@/components/Term'
import {
  getRun,
  getProject,
  getSitePages,
  getProjectTemplates,
  getSiteAuditEvidence,
  getRunEvidence,
} from '@/lib/repositories'
import type { SiteAuditPayload } from '@/lib/crawl/site-audit'
import { filterToSnapshot, depthCellsFor, linkStructureCounts, snapshotStatusFor, type DepthCell } from '@/lib/crawl/site-view'
import { equityRelativeFor } from '@/lib/crawl/link-equity'
import { toggleKeyPageAction, setRepresentativeAction } from './actions'

// 站点结构面板：全站健康统计（site_audit 快照，L4 实测）+ 推断模板列表 + 页面清单。
// Next 16：params / searchParams 是 Promise，必须 await。
export default async function SiteStructurePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { locale, id } = await params
  const { status: statusFilter } = await searchParams
  setRequestLocale(locale)
  // terms 命名空间：术语解释文案统一放这，供本页与 ReportView 共用同一份解释（P1-3 修复）。
  const [t, tt, run] = await Promise.all([getTranslations('site'), getTranslations('terms'), getRun(id)])
  if (!run) notFound()
  const [project, pages, templates, audit, runEvidence] = await Promise.all([
    getProject(run.projectId),
    getSitePages(run.projectId),
    getProjectTemplates(run.projectId),
    getSiteAuditEvidence(id),
    getRunEvidence(id),
  ])
  const payload = (audit?.payload ?? null) as SiteAuditPayload | null
  const pageById = new Map(pages.map((p) => [p.id, p]))
  // 代表页深检摘要：本次 run 的 render_check 证据按 sitePageId 归属（无渲染配置时为空）。
  // mainContentDelta = 渲染后正文字符 − 初始 HTML 正文字符（有符号的绝对字符差，非比例）。
  const renderDeltaBySitePageId = new Map(
    runEvidence
      .filter((e) => e.type === 'render_check' && e.sitePageId)
      .map((e) => [e.sitePageId as string, (e.payload as { mainContentDelta?: number } | null)?.mainContentDelta]),
  )
  // 页面清单只列本 run 快照里的 URL（site_pages 跨 run 累积，spec S2 §5）；再按抓取状态过滤。
  const runPages = filterToSnapshot(pages, payload)
  // 状态与 HTTP 码取自本次快照：site_pages 只存最新一轮的值（第二轮独立审查 #17）。
  const snapStatus = snapshotStatusFor(payload)
  const statusOf = (p: { url: string; checkStatus: string; httpStatus: number | null }) => snapStatus(p.url) ?? { checkStatus: p.checkStatus, httpStatus: p.httpStatus }
  const visiblePages = statusFilter ? runPages.filter((p) => statusOf(p).checkStatus === statusFilter) : runPages

  if (!payload) {
    return (
      <Shell runId={id} domain={project?.domain}>
        <section className="screen show">
          <Link href={`/${locale}/runs/${id}`} className="rec-back-link">
            <span aria-hidden="true">←</span>
            {t('backToDiagnosis')}
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-semibold">{t('title')}</h1>
            <div className="flex items-center gap-3 text-xs">
              <Link href={`/${locale}/runs/${id}/report`} className="underline underline-offset-2">
                {t('viewReport')}
              </Link>
              <Link href={`/${locale}/runs/${id}/output`} className="underline underline-offset-2">
                {t('goToOutput')}
              </Link>
            </div>
          </div>
          <div className="mt-4">
            <EmptyStateCTA
              title={t('emptyTitle')}
              impact={t('noData')}
              actionLabel={t('backToDiagnosis')}
              href={`/${locale}/runs/${id}`}
            />
          </div>
        </section>
      </Shell>
    )
  }

  // problem: true 的卡片在数值 > 0 时着警示色（--gap 体系）；正向/中性指标（已轻检、
  // 被 AI 引用页等）保持默认中性色。只按 >0 / =0 二分，不引入新的判断阈值（spec 任务书 §5）。
  // term：术语解释文案（P1-3 修复），只给需要解释的统计卡配，其余保持裸 label 不变。
  const stats: { key: string; label: string; value: number; problem?: boolean; term?: string }[] = [
    { key: 'totalDiscovered', label: t('totalDiscovered'), value: payload.stats.totalDiscovered },
    { key: 'checked', label: t('checked'), value: payload.stats.checked },
    { key: 'http4xx', label: t('http4xx'), value: payload.stats.http4xx, problem: true, term: tt('http4xx') },
    { key: 'noindex', label: t('noindex'), value: payload.stats.noindex, problem: true, term: tt('noindex') },
    { key: 'canonicalOffsite', label: t('canonicalOffsite'), value: payload.stats.canonicalOffsite, problem: true, term: tt('canonical') },
    { key: 'orphanPages', label: t('orphanPages'), value: payload.stats.orphanPages, problem: true, term: tt('orphanPages') },
    { key: 'citedPages', label: t('citedPages'), value: payload.stats.citedPages },
  ]

  const statuses = ['checked', 'discovered_only', 'blocked_by_robots', 'error'] as const
  // 链接结构（spec S2 §5）：计数与 L 规则同源（analyzeLinkIntegrity）；历史快照无图谱时整块不显示。
  const linkCounts = linkStructureCounts(payload)
  const depthCell = depthCellsFor(payload)
  // 内链权重（spec S3 §5）：站内 PageRank ÷ 中位数（1.0× 居中），模型估算；已抓 HTML 页 < 10 时整列为空。
  const equity = equityRelativeFor(payload)
  const equityLabel = (v: number | null) => (v === null ? '—' : v < 0.1 ? '<0.1×' : `${v.toFixed(1)}×`)
  const hasEquity = linkCounts !== null && !linkCounts.entryNoLinks && runPages.some((p) => equity(p.url) !== null)
  const depthLabel = (c: DepthCell) =>
    c.kind === 'exact' ? String(c.depth)
      : c.kind === 'upper' ? `≤${c.depth}`
        : c.kind === 'unreachable' ? t('unreachable')
          : c.kind === 'no_path_found' ? t('noPathFound')
            : '—'
  const linkStats = linkCounts && !linkCounts.entryNoLinks
    ? [
        { key: 'reachable', label: t('reachablePages'), value: linkCounts.reachable },
        { key: 'unreachableSitemap', label: t('unreachableSitemapPages'), value: linkCounts.unreachableSitemap, problem: true },
        { key: 'brokenTargets', label: t('brokenTargets'), value: linkCounts.brokenTargets, problem: true },
        { key: 'deadEnds', label: t('deadEndPages'), value: linkCounts.deadEnds, problem: true },
      ]
    : []

  return (
    <Shell runId={id} domain={project?.domain}>
      <section className="screen show">
        <Link href={`/${locale}/runs/${id}`} className="rec-back-link">
          <span aria-hidden="true">←</span>
          {t('backToDiagnosis')}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">
            {project?.domain} · {t('title')}
          </h1>
          <div className="flex items-center gap-3 text-xs">
            <Link href={`/${locale}/runs/${id}/report`} className="underline underline-offset-2">
              {t('viewReport')}
            </Link>
            <Link href={`/${locale}/runs/${id}/output`} className="underline underline-offset-2">
              {t('goToOutput')}
            </Link>
          </div>
        </div>

        <div className="mt-4">
          <h2 className="text-sm font-medium">{t('statsTitle')}</h2>
          <div className="stats mt-2">
            {stats.map((s) => {
              const isWarn = Boolean(s.problem) && s.value > 0
              return (
                <div key={s.key} className={isWarn ? 'card stat bg-gap-bg' : 'card stat'}>
                  <div className="k">{s.term ? <Term explain={s.term}>{s.label}</Term> : s.label}</div>
                  <div className={isWarn ? 'v text-gap' : 'v'}>{s.value}</div>
                </div>
              )
            })}
          </div>
          {payload.stats.truncated > 0 && (
            <p className="mt-2 text-xs text-warning">
              {t('truncatedNotice', { maxPages: payload.protocol.maxPages, count: payload.stats.truncated })}
            </p>
          )}
        </div>

        {linkCounts && (
          <div className="mt-6">
            <h2 className="text-sm font-medium">{t('linkStructureTitle')}</h2>
            {linkCounts.entryNoLinks ? (
              <p className="mt-2 text-xs text-warning">{t('entryNoLinksNotice')}</p>
            ) : (
              <>
                <div className="stats mt-2">
                  {linkStats.map((s) => {
                    const isWarn = Boolean(s.problem) && s.value > 0
                    return (
                      <div key={s.key} className={isWarn ? 'card stat bg-gap-bg' : 'card stat'}>
                        <div className="k">{s.label}</div>
                        <div className={isWarn ? 'v text-gap' : 'v'}>{s.value}</div>
                      </div>
                    )
                  })}
                </div>
                {!linkCounts.closureComplete && (
                  <p className="mt-2 text-xs text-warning">{t('linkPartialNotice')}</p>
                )}
                {hasEquity && <p className="mt-1 text-xs text-ghost">{t('linkEquityNote')}</p>}
              </>
            )}
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-sm font-medium">
            {t('templatesTitle')}{' '}
            <span className="tag i">
              <span className="dot" />
              {t('inferredBadge')}
            </span>
          </h2>
          <div className="report-table-wrap mt-2">
            <table className="report-table">
              <thead>
                <tr>
                  <th><Term explain={tt('urlPattern')}>{t('pattern')}</Term></th>
                  <th>{t('pageCount')}</th>
                  <th>{t('representative')}</th>
                  <th><Term explain={tt('renderDelta')}>{t('renderDelta')}</Term></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => {
                  const rep = tpl.representativePageId ? pageById.get(tpl.representativePageId) : undefined
                  const delta = tpl.representativePageId
                    ? renderDeltaBySitePageId.get(tpl.representativePageId)
                    : undefined
                  return (
                    <tr key={tpl.id}>
                      <td className="font-mono text-xs">{tpl.pattern}</td>
                      <td>{tpl.pageCount}</td>
                      <td className="max-w-xs truncate">
                        {rep?.url ?? '—'}
                        {tpl.source === 'user' && (
                          <span className="ml-1 text-xs text-ghost">{t('userPinned')}</span>
                        )}
                      </td>
                      <td>{delta !== undefined ? `${delta > 0 ? '+' : ''}${delta}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-medium">{t('pagesTitle')}</h2>
          <nav className="mt-1 space-x-2 text-xs">
            <a href={`/${locale}/runs/${id}/site`} className={!statusFilter ? 'font-semibold' : 'underline'}>
              {t('filterAll')}
            </a>
            {statuses.map((s) => (
              <a
                key={s}
                href={`/${locale}/runs/${id}/site?status=${s}`}
                className={statusFilter === s ? 'font-semibold' : 'underline'}
              >
                {t(`status.${s}`)}
              </a>
            ))}
          </nav>
          <div className="report-table-wrap mt-2">
            <table className="report-table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th><Term explain={tt('httpStatus')}>HTTP</Term></th>
                  <th><Term explain={tt('clickDepth')}>{t('clickDepth')}</Term></th>
                  <th>{t('inboundLinks')}</th>
                  <th><Term explain={tt('linkEquity')}>{t('linkEquity')}</Term></th>
                  <th><Term explain={tt('urlPattern')}>{t('pattern')}</Term></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visiblePages.map((p) => {
                  const cell = depthCell(p.url)
                  return (
                  <tr key={p.id}>
                    <td className="max-w-md truncate font-mono text-xs">
                      {p.url}
                      {p.isKeyPage && (
                        <span className="ml-1 rounded-full bg-primary-muted px-1.5 py-0.5 text-xs text-primary">
                          {t('keyPageBadge')}
                        </span>
                      )}
                    </td>
                    <td>{statusOf(p).httpStatus ?? t(`status.${statusOf(p).checkStatus}`)}</td>
                    <td>{depthLabel(cell)}</td>
                    <td>{cell.inAll ?? '—'}</td>
                    <td>{equityLabel(equity(p.url))}</td>
                    <td className="font-mono text-xs">
                      {p.templateId ? templates.find((tp) => tp.id === p.templateId)?.pattern ?? '—' : '—'}
                    </td>
                    <td className="space-x-2 text-right">
                      <SitePageActions
                        pageId={p.id}
                        isKeyPage={p.isKeyPage}
                        labels={{ mark: t('markKeyPage'), unmark: t('unmarkKeyPage'), notice: t('nextRunNotice') }}
                        onToggleKeyPage={async (pageId, next) => {
                          'use server'
                          await toggleKeyPageAction(pageId, next, id, locale)
                        }}
                      />
                      {p.templateId && p.checkStatus === 'checked' && (
                        <form
                          className="inline"
                          action={async () => {
                            'use server'
                            await setRepresentativeAction(p.templateId!, p.id, id, locale)
                          }}
                        >
                          <button type="submit" className="text-xs text-muted underline underline-offset-2">
                            {t('setRepresentative')}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </Shell>
  )
}
