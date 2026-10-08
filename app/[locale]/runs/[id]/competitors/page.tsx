import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { RunWorkspace } from '@/components/RunWorkspace'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { Notice } from '@/components/Notice'
import { Tag } from '@/components/Tag'
import { Button, ButtonLink } from '@/components/Button'
import { getRun, getProject, getCompetitors, getRunEvidence } from '@/lib/repositories'
import { displayDomain } from '@/lib/runs/workspace'
import { confirmCompetitorAction, dismissCompetitorAction, restoreCompetitorAction } from './actions'

// 竞品（ux-blueprint §3.6；Phase C，spec §7.4-4）：SERP 重叠候选竞品 → 人工确认闸门 → 对比矩阵。
// 候选竞品用表格行 + 行内「确认 / 驳回」，不用两列卡片。
// 只有 confirmed 竞品才进入 gap 分析与对比（人在环）。确认动作触发增量再评估（两段式诊断）。
// Server Component（Next 16）：await params、pin locale；确认/驳回走 Server Action。
export default async function CompetitorsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [t, run] = await Promise.all([getTranslations('competitors'), getRun(id)])
  if (!run) notFound()
  const [project, competitors, evidence] = await Promise.all([
    getProject(run.projectId),
    getCompetitors(run.projectId),
    getRunEvidence(id),
  ])

  // seed_serp 证据 → 每个域名的共同关键词（确认决策依据，spec §7.4-4）。
  const serpRow = evidence.find(
    (e) => e.type === 'dataforseo_serp' && (e.payload as { kind?: string } | null)?.kind === 'seed_serp',
  )
  const serpResults = serpRow
    ? ((serpRow.payload as { results?: { keyword: string; items: { domain: string }[] }[] }).results ?? [])
    : []
  const kwByDomain = new Map<string, string[]>()
  for (const r of serpResults) {
    for (const it of r.items) {
      const d = it.domain.replace(/^www\./, '').toLowerCase()
      const arr = kwByDomain.get(d) ?? []
      if (!arr.includes(r.keyword)) arr.push(r.keyword)
      kwByDomain.set(d, arr)
    }
  }
  const topKw = (domain: string) => (kwByDomain.get(domain.replace(/^www\./, '').toLowerCase()) ?? []).slice(0, 5)

  const candidates = competitors.filter((c) => c.status === 'candidate')
  const confirmed = competitors.filter((c) => c.status === 'confirmed')
  const dismissed = competitors.filter((c) => c.status === 'dismissed')
  const pct = (s: string | null) => (s == null ? '—' : `${Math.round(Number(s) * 100)}%`)

  const own = project ? displayDomain(project.domain) : ''

  return (
    <RunWorkspace runId={id} locale={locale} current="competitors">
      <section className="ui-section">
        <SectionHeader title={t('title')} note={t('subtitle')} />

        {competitors.length === 0 ? (
          <div className="ui-panel">
            <EmptyState
              title={t('emptyTitle')}
              description={t('noData')}
              action={
                <ButtonLink href={`/${locale}/settings#source-dataforseo`} size="sm">
                  {t('emptyCta')}
                </ButtonLink>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            {/* 候选竞品（待确认）：确认后才进入缺口分析与对比（人在环） */}
            {candidates.length > 0 ? (
              <section className="ui-subsec" aria-labelledby="comp-candidates">
                <h3 id="comp-candidates" className="ui-subsec__title">
                  {t('candidatesTitle')} <span className="ui-subsec__count">{candidates.length}</span>
                </h3>
                <Notice>{t('reevalNotice')}</Notice>
                <div className="ui-panel ui-table-wrap">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th>{t('domainCol')}</th>
                        <th className="ui-num">{t('overlapScore')}</th>
                        <th className="ui-num">{t('sharedKeywords')}</th>
                        <th>{t('topKeywords')}</th>
                        <th>
                          <span className="sr-only">{t('actionsLabel')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr key={c.id}>
                          <td className="ui-mono">{c.domain}</td>
                          <td className="ui-num">{pct(c.overlapScore)}</td>
                          <td className="ui-num">{c.sharedKeywordsCount}</td>
                          <td className="ui-cell-muted">{topKw(c.domain).join(' · ') || '—'}</td>
                          <td>
                            <span className="ui-row-actions">
                              <form
                                action={async () => {
                                  'use server'
                                  await confirmCompetitorAction(c.id, run.projectId, id, locale)
                                }}
                              >
                                <Button type="submit" size="sm" variant="primary">
                                  {t('confirm')}
                                </Button>
                              </form>
                              <form
                                action={async () => {
                                  'use server'
                                  await dismissCompetitorAction(c.id, id, locale)
                                }}
                              >
                                <Button type="submit" size="sm" variant="quiet">
                                  {t('dismiss')}
                                </Button>
                              </form>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {/* 已确认竞品对比 */}
            <section className="ui-subsec" aria-labelledby="comp-matrix">
              <h3 id="comp-matrix" className="ui-subsec__title">
                {t('matrixTitle')}
              </h3>
              {confirmed.length === 0 ? (
                <p className="ui-result__note">{t('matrixEmpty')}</p>
              ) : (
                <div className="ui-panel ui-table-wrap">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th>{t('domainCol')}</th>
                        <th className="ui-num">{t('overlapScore')}</th>
                        <th className="ui-num">{t('sharedKeywords')}</th>
                        <th>{t('topKeywords')}</th>
                        <th>
                          <span className="sr-only">{t('actionsLabel')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="ui-row-own">
                        <td className="ui-mono">
                          {own} <Tag tone="accent">{t('you')}</Tag>
                        </td>
                        <td className="ui-num">—</td>
                        <td className="ui-num">—</td>
                        <td>—</td>
                        <td />
                      </tr>
                      {confirmed.map((c) => (
                        <tr key={c.id}>
                          <td className="ui-mono">{c.domain}</td>
                          <td className="ui-num">{pct(c.overlapScore)}</td>
                          <td className="ui-num">{c.sharedKeywordsCount}</td>
                          <td className="ui-cell-muted">{topKw(c.domain).join(' · ') || '—'}</td>
                          <td>
                            <span className="ui-row-actions">
                              <form
                                action={async () => {
                                  'use server'
                                  await dismissCompetitorAction(c.id, id, locale)
                                }}
                              >
                                <Button type="submit" size="sm" variant="quiet">
                                  {t('dismiss')}
                                </Button>
                              </form>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="ui-footnote">{t('estimateNote')}</p>
            </section>

            {/* 已驳回（可恢复） */}
            {dismissed.length > 0 ? (
              <section className="ui-subsec" aria-labelledby="comp-dismissed">
                <h3 id="comp-dismissed" className="ui-subsec__title">
                  {t('dismissedTitle')} <span className="ui-subsec__count">{dismissed.length}</span>
                </h3>
                <ul className="ui-panel ui-plainlist">
                  {dismissed.map((c) => (
                    <li key={c.id}>
                      <span className="ui-mono ui-muted">{c.domain}</span>
                      <form
                        action={async () => {
                          'use server'
                          await restoreCompetitorAction(c.id, id, locale)
                        }}
                      >
                        <Button type="submit" size="sm" variant="quiet">
                          {t('restore')}
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </section>
    </RunWorkspace>
  )
}
