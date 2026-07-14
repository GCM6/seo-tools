import { getTranslations, setRequestLocale } from 'next-intl/server'
import Link from 'next/link'
import { Shell } from '@/components/Shell'
import { RecCard, type RecStatus } from '@/components/RecCard'
import { getRecommendations } from '@/lib/repositories'

const PRIORITY_ORDER: Record<string, number> = {
  quick_win: 0,
  strategic: 1,
  fill_in: 2,
  low: 3,
}

function editedNote(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const p = payload as Record<string, unknown>
  if (typeof p.note === 'string') return p.note
  const parts = [p.angle, p.injectedFacts].filter((v): v is string => typeof v === 'string' && v.length > 0)
  return parts.join('\n')
}

// 屏3 优化建议 — Server Component. Fetches the run's recommendations and
// renders a human-gate state-machine card per row inside the workflow Shell.
export default async function RecommendationsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const t = await getTranslations('screen3')
  const recs = [...await getRecommendations(id)].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
  )
  const readyCount = recs.filter((r) => r.status === 'accepted' || r.status === 'edited').length
  const pendingCount = recs.filter((r) => r.status === 'draft').length

  return (
    <Shell runId={id}>
      <div className="sec-h rec-page-head">
        <div>
          <Link href={`/${locale}/runs/${id}`} className="rec-back-link">
            <span aria-hidden="true">←</span>
            {t('backToDiagnosis')}
          </Link>
          <h2>{t('title')}</h2>
          <span className="meta">{t('meta')}</span>
        </div>
        {recs.length ? (
          <div className="rec-progress" aria-label={t('decisionSummary')}>
            <span>{t('progress.total', { count: recs.length })}</span>
            <span>{t('progress.pending', { count: pendingCount })}</span>
            <strong>{t('progress.ready', { count: readyCount })}</strong>
          </div>
        ) : null}
      </div>

      {recs.length ? (
        <div className="rec-list">
          {recs.map((r) => {
          const note = editedNote(r.editedPayload)
          return (
            <RecCard
              key={r.id}
              id={r.id}
              priority={r.priority}
              title={r.what}
              initialStatus={r.status as RecStatus}
              fields={{
                why: r.why || undefined,
                evidence: r.evidenceRefs.length ? r.evidenceRefs.join(' · ') : undefined,
                impact: r.expectedImpact || undefined,
                effort: r.effort || undefined,
                risk: r.risk || undefined,
                validationMethod: r.validationMethod || undefined,
                confidence: r.confidence || undefined,
                editedNote: note || undefined,
              }}
              editDraft={note || r.why}
            />
          )
          })}
        </div>
      ) : (
        <div className="card pending-block">{t('empty')}</div>
      )}

      <div className="note">{t('note')}</div>
    </Shell>
  )
}
