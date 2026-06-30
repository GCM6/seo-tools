import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { RecCard, type RecStatus } from '@/components/RecCard'
import { getRecommendations } from '@/lib/repositories'

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
  const recs = await getRecommendations(id)

  return (
    <Shell active={3} locale={locale} runId={id}>
      <div className="sec-h">
        <h2>{t('title')}</h2>
        <span className="meta">{t('meta')}</span>
      </div>

      {recs.map((r) => (
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
          }}
          editDraft={r.why}
        />
      ))}

      <div className="note">{t('note')}</div>
    </Shell>
  )
}
