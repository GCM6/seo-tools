import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Shell } from '@/components/Shell'
import { SitePageActions } from '@/components/SitePageActions'
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
  const [t, run] = await Promise.all([getTranslations('site'), getRun(id)])
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
      <Shell active={2} locale={locale} runId={id} domain={project?.domain}>
        <section className="screen show">
          <h1 className="text-lg font-semibold">{t('title')}</h1>
          <p className="mt-4 text-sm text-neutral-500">{t('noData')}</p>
        </section>
      </Shell>
    )
  }

  const stats: [string, number][] = [
    [t('totalDiscovered'), payload.stats.totalDiscovered],
    [t('checked'), payload.stats.checked],
    [t('http4xx'), payload.stats.http4xx],
    [t('noindex'), payload.stats.noindex],
    [t('canonicalOffsite'), payload.stats.canonicalOffsite],
    [t('orphanPages'), payload.stats.orphanPages],
    [t('citedPages'), payload.stats.citedPages],
  ]

  const statuses = ['checked', 'discovered_only', 'blocked_by_robots', 'error'] as const

  return (
    <Shell active={2} locale={locale} runId={id} domain={project?.domain}>
      <section className="screen show">
        <h1 className="text-lg font-semibold">
          {project?.domain} · {t('title')}
        </h1>

        <div className="mt-4">
          <h2 className="text-sm font-medium">{t('statsTitle')}</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded border p-3">
                <div className="text-xs text-neutral-500">{label}</div>
                <div className="text-xl font-semibold">{value}</div>
              </div>
            ))}
          </div>
          {payload.stats.truncated > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              {t('truncatedNotice', { maxPages: payload.protocol.maxPages, count: payload.stats.truncated })}
            </p>
          )}
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-medium">
            {t('templatesTitle')}{' '}
            <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
              {t('inferredBadge')}
            </span>
          </h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="py-1">{t('pattern')}</th>
                <th>{t('pageCount')}</th>
                <th>{t('representative')}</th>
                <th>{t('renderDelta')}</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => {
                const rep = tpl.representativePageId ? pageById.get(tpl.representativePageId) : undefined
                const delta = tpl.representativePageId
                  ? renderDeltaBySitePageId.get(tpl.representativePageId)
                  : undefined
                return (
                  <tr key={tpl.id} className="border-t">
                    <td className="py-1.5 font-mono text-xs">{tpl.pattern}</td>
                    <td>{tpl.pageCount}</td>
                    <td className="max-w-xs truncate">
                      {rep?.url ?? '—'}
                      {tpl.source === 'user' && (
                        <span className="ml-1 text-xs text-neutral-400">{t('userPinned')}</span>
                      )}
                    </td>
                    <td>{delta !== undefined ? `${delta > 0 ? '+' : ''}${delta}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="py-1">URL</th>
                <th>HTTP</th>
                <th>{t('pattern')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visiblePages.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="max-w-md truncate py-1.5 font-mono text-xs">
                    {p.url}
                    {p.isKeyPage && (
                      <span className="ml-1 rounded bg-blue-50 px-1 text-xs text-blue-600">{t('keyPageBadge')}</span>
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
                        <button type="submit" className="text-xs text-neutral-500 underline underline-offset-2">
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
      </section>
    </Shell>
  )
}
