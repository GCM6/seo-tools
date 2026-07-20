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
  const visiblePages = statusFilter ? pages.filter((p) => p.checkStatus === statusFilter) : pages

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
                  <th><Term explain={tt('urlPattern')}>{t('pattern')}</Term></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visiblePages.map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-md truncate font-mono text-xs">
                      {p.url}
                      {p.isKeyPage && (
                        <span className="ml-1 rounded-full bg-primary-muted px-1.5 py-0.5 text-xs text-primary">
                          {t('keyPageBadge')}
                        </span>
                      )}
                    </td>
                    <td>{p.httpStatus ?? t(`status.${p.checkStatus}`)}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </Shell>
  )
}
