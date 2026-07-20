import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Shell } from '@/components/Shell'
import { EmptyStateCTA } from '@/components/EmptyStateCTA'
import { getRun, getProject, getCompetitors, getRunEvidence } from '@/lib/repositories'
import { confirmCompetitorAction, dismissCompetitorAction, restoreCompetitorAction } from './actions'

// 竞品确认面板（Phase C，spec §7.4-4）：SERP 重叠候选竞品 → 人工确认闸门 → 对比矩阵。
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
        <p className="mt-1 max-w-3xl text-sm text-muted">{t('subtitle')}</p>

        {competitors.length === 0 ? (
          <div className="mt-6">
            <EmptyStateCTA
              title={t('emptyTitle')}
              impact={t('noData')}
              actionLabel={t('emptyCta')}
              href={`/${locale}/settings#source-dataforseo`}
            />
          </div>
        ) : (
          <>
            {/* —— 候选竞品（待确认）—— */}
            {candidates.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-medium">{t('candidatesTitle')}</h2>
                <p className="mt-1 text-xs text-warning">{t('reevalNotice')}</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {candidates.map((c) => (
                    <div key={c.id} className="card p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm">{c.domain}</span>
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                          {t('candidateBadge')}
                        </span>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted">
                        <div>
                          {t('overlapScore')}: <b>{pct(c.overlapScore)}</b>
                        </div>
                        <div>
                          {t('sharedKeywords')}: <b>{c.sharedKeywordsCount}</b>
                        </div>
                      </dl>
                      {topKw(c.domain).length > 0 && (
                        <div className="mt-2 text-xs text-muted">
                          <span className="text-ghost">{t('topKeywords')}:</span> {topKw(c.domain).join(' · ')}
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <form
                          action={async () => {
                            'use server'
                            await confirmCompetitorAction(c.id, run.projectId, id, locale)
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-on-primary hover:bg-primary-hover"
                          >
                            {t('confirm')}
                          </button>
                        </form>
                        <form
                          action={async () => {
                            'use server'
                            await dismissCompetitorAction(c.id, id, locale)
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2"
                          >
                            {t('dismiss')}
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* —— 确认竞品对比矩阵 —— */}
            <div className="mt-6">
              <h2 className="text-sm font-medium">{t('matrixTitle')}</h2>
              {confirmed.length === 0 ? (
                <p className="mt-2 pending-block">{t('matrixEmpty')}</p>
              ) : (
                <div className="report-table-wrap mt-2">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>{t('confirmedTitle')}</th>
                        <th>{t('overlapScore')}</th>
                        <th>{t('sharedKeywords')}</th>
                        <th>{t('topKeywords')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-primary-muted">
                        <td className="font-mono text-xs font-semibold">{project?.domain} ({t('you')})</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td></td>
                      </tr>
                      {confirmed.map((c) => (
                        <tr key={c.id}>
                          <td className="font-mono text-xs">{c.domain}</td>
                          <td>{pct(c.overlapScore)}</td>
                          <td>{c.sharedKeywordsCount}</td>
                          <td className="max-w-xs truncate text-xs text-muted">{topKw(c.domain).join(' · ') || '—'}</td>
                          <td className="text-right">
                            <form
                              action={async () => {
                                'use server'
                                await dismissCompetitorAction(c.id, id, locale)
                              }}
                            >
                              <button type="submit" className="text-xs text-muted underline underline-offset-2">
                                {t('dismiss')}
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-xs text-ghost">{t('estimateNote')}</p>
            </div>

            {/* —— 已驳回（可恢复）—— */}
            {dismissed.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-medium text-muted">{t('dismissedTitle')}</h2>
                <ul className="mt-2 space-y-1">
                  {dismissed.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 text-sm text-muted">
                      <span className="font-mono text-xs line-through">{c.domain}</span>
                      <form
                        action={async () => {
                          'use server'
                          await restoreCompetitorAction(c.id, id, locale)
                        }}
                      >
                        <button type="submit" className="text-xs text-muted underline underline-offset-2">
                          {t('restore')}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </Shell>
  )
}
