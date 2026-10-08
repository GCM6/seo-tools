import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RunWorkspace } from '@/components/RunWorkspace'
import { SitePageActions } from '@/components/SitePageActions'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { EvidenceBadge } from '@/components/EvidenceBadge'
import { Notice } from '@/components/Notice'
import { StatGrid } from '@/components/StatGrid'
import { Tag } from '@/components/Tag'
import { Button } from '@/components/Button'
import { Term } from '@/components/Term'
import {
  getRun,
  getSitePages,
  getProjectTemplates,
  getSiteAuditEvidence,
  getRunEvidence,
} from '@/lib/repositories'
import type { SiteAuditPayload } from '@/lib/crawl/site-audit'
import { filterToSnapshot, depthCellsFor, linkStructureCounts, snapshotStatusFor, type DepthCell } from '@/lib/crawl/site-view'
import { equityRelativeFor } from '@/lib/crawl/link-equity'
import { toggleKeyPageAction, setRepresentativeAction } from './actions'

// 站点结构（ux-blueprint §3.6 原始数据）：全站健康统计（site_audit 快照，L4 实测）+ 链接结构 +
// 推断模板列表 + 页面清单。统一结构：区段标题 → 汇总数字 → 主表格。
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
  const [t, tt, tRoot, run] = await Promise.all([getTranslations('site'), getTranslations('terms'), getTranslations(), getRun(id)])
  if (!run) notFound()
  const [pages, templates, audit, runEvidence] = await Promise.all([
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
      <RunWorkspace runId={id} locale={locale} current="site">
        <section className="ui-section">
          <SectionHeader title={t('title')} note={t('subtitle')} />
          <div className="ui-panel"><EmptyState title={t('emptyTitle')} description={t('noData')} /></div>
        </section>
      </RunWorkspace>
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

  const statItems = (list: typeof stats) =>
    list.map((s) => ({
      key: s.key,
      label: s.term ? <Term explain={s.term}>{s.label}</Term> : s.label,
      value: s.value,
      warn: Boolean(s.problem) && s.value > 0,
    }))
  const templateById = new Map(templates.map((tp) => [tp.id, tp.pattern]))
  const measured = <EvidenceBadge grade="hard" label={tRoot('common.tag.measured')} />

  return (
    <RunWorkspace runId={id} locale={locale} current="site">
      <section className="ui-section">
        <SectionHeader title={t('title')} note={t('subtitle')} />
        <div className="grid grid-cols-1 gap-8">
          {/* 全站健康（L4 实测） */}
          <section className="ui-subsec" aria-labelledby="site-stats">
            <h3 id="site-stats" className="ui-subsec__title">
              {t('statsHeading')} {measured}
            </h3>
            <StatGrid items={statItems(stats)} />
            {payload.stats.truncated > 0 ? (
              <Notice tone="warn">{t('truncatedNotice', { maxPages: payload.protocol.maxPages, count: payload.stats.truncated })}</Notice>
            ) : null}
          </section>

          {/* 链接结构（历史快照没有链接图谱时整块不显示） */}
          {linkCounts ? (
            <section className="ui-subsec" aria-labelledby="site-links">
              <h3 id="site-links" className="ui-subsec__title">
                {t('linkStructureHeading')} {measured}
              </h3>
              {linkCounts.entryNoLinks ? (
                <Notice tone="warn">{t('entryNoLinksNotice')}</Notice>
              ) : (
                <>
                  <StatGrid items={statItems(linkStats)} />
                  {!linkCounts.closureComplete ? <Notice tone="warn">{t('linkPartialNotice')}</Notice> : null}
                  {hasEquity ? <p className="ui-footnote">{t('linkEquityNote')}</p> : null}
                </>
              )}
            </section>
          ) : null}

          {/* URL 模板（推断） */}
          <section className="ui-subsec" aria-labelledby="site-templates">
            <h3 id="site-templates" className="ui-subsec__title">
              {t('templatesTitle')} <EvidenceBadge grade="inferred" label={tRoot('common.tag.inferred')} />
            </h3>
            {templates.length ? (
              <div className="ui-panel ui-table-wrap">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>
                        <Term explain={tt('urlPattern')}>{t('pattern')}</Term>
                      </th>
                      <th className="ui-num">{t('pageCount')}</th>
                      <th>{t('representative')}</th>
                      <th className="ui-num">
                        <Term explain={tt('renderDelta')}>{t('renderDelta')}</Term>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((tpl) => {
                      const rep = tpl.representativePageId ? pageById.get(tpl.representativePageId) : undefined
                      const delta = tpl.representativePageId ? renderDeltaBySitePageId.get(tpl.representativePageId) : undefined
                      return (
                        <tr key={tpl.id}>
                          <td className="ui-mono">{tpl.pattern}</td>
                          <td className="ui-num">{tpl.pageCount}</td>
                          <td>
                            <span className="ui-cell-url ui-mono" title={rep?.url}>
                              {rep?.url ?? '—'}
                            </span>
                            {tpl.source === 'user' ? <span className="ui-footnote"> {t('userPinned')}</span> : null}
                          </td>
                          <td className="ui-num">{delta !== undefined ? `${delta > 0 ? '+' : ''}${delta}` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="ui-result__note">{t('noTemplates')}</p>
            )}
          </section>

          {/* 页面清单：按本次快照的抓取状态筛选 */}
          <section className="ui-subsec" aria-labelledby="site-pages">
            <h3 id="site-pages" className="ui-subsec__title">
              {t('pagesTitle')} <span className="ui-subsec__count">{visiblePages.length}</span>
            </h3>
            <nav className="ui-chips" aria-label={t('filterLabel')}>
              <Link href={`/${locale}/runs/${id}/site`} className="ui-chip" aria-current={!statusFilter ? 'page' : undefined}>
                {t('filterAll')}
              </Link>
              {statuses.map((s) => (
                <Link
                  key={s}
                  href={`/${locale}/runs/${id}/site?status=${s}`}
                  className="ui-chip"
                  aria-current={statusFilter === s ? 'page' : undefined}
                >
                  {t(`status.${s}`)}
                </Link>
              ))}
            </nav>
            {visiblePages.length ? (
              <div className="ui-panel ui-table-wrap">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>URL</th>
                      <th>
                        <Term explain={tt('httpStatus')}>HTTP</Term>
                      </th>
                      <th className="ui-num">
                        <Term explain={tt('clickDepth')}>{t('clickDepth')}</Term>
                      </th>
                      <th className="ui-num">{t('inboundLinks')}</th>
                      <th className="ui-num">
                        <Term explain={tt('linkEquity')}>{t('linkEquity')}</Term>
                      </th>
                      <th>
                        <Term explain={tt('urlPattern')}>{t('pattern')}</Term>
                      </th>
                      <th>
                        <span className="sr-only">{t('actionsLabel')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePages.map((p) => {
                      const cell = depthCell(p.url)
                      return (
                        <tr key={p.id}>
                          <td>
                            <span className="ui-cell-url ui-mono" title={p.url}>
                              {p.url}
                            </span>
                            {p.isKeyPage ? (
                              <>
                                {' '}
                                <Tag tone="accent">{t('keyPageBadge')}</Tag>
                              </>
                            ) : null}
                          </td>
                          <td>{statusOf(p).httpStatus ?? t(`status.${statusOf(p).checkStatus}`)}</td>
                          <td className="ui-num">{depthLabel(cell)}</td>
                          <td className="ui-num">{cell.inAll ?? '—'}</td>
                          <td className="ui-num">{equityLabel(equity(p.url))}</td>
                          <td className="ui-mono">{p.templateId ? templateById.get(p.templateId) ?? '—' : '—'}</td>
                          <td>
                            <span className="ui-row-actions">
                              <SitePageActions
                                pageId={p.id}
                                isKeyPage={p.isKeyPage}
                                labels={{ mark: t('markKeyPage'), unmark: t('unmarkKeyPage'), notice: t('nextRunNotice') }}
                                onToggleKeyPage={async (pageId, next) => {
                                  'use server'
                                  await toggleKeyPageAction(pageId, next, id, locale)
                                }}
                              />
                              {p.templateId && p.checkStatus === 'checked' ? (
                                <form
                                  action={async () => {
                                    'use server'
                                    await setRepresentativeAction(p.templateId!, p.id, id, locale)
                                  }}
                                >
                                  <Button type="submit" size="sm" variant="quiet">
                                    {t('setRepresentative')}
                                  </Button>
                                </form>
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="ui-result__note">{t('noPagesForFilter')}</p>
            )}
            <p className="ui-footnote">{t('nextRunNotice')}</p>
          </section>
        </div>
      </section>
    </RunWorkspace>
  )
}
