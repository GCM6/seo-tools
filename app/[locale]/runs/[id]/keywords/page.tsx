import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Shell } from '@/components/Shell'
import { KeywordTable } from '@/components/KeywordTable'
import { EmptyStateCTA } from '@/components/EmptyStateCTA'
import { getRun, getProject, getRunKeywordMetrics, getRunKeywordGaps, getKeywords } from '@/lib/repositories'

// 关键词现状 tab（Screen 2 子页，active={2}）。复用 KeywordTable。
export default async function KeywordsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [t, run] = await Promise.all([getTranslations('keywords'), getRun(id)])
  if (!run) notFound()
  const [project, keywordMetrics, keywordGaps, keywords] = await Promise.all([
    getProject(run.projectId),
    getRunKeywordMetrics(id),
    getRunKeywordGaps(id),
    getKeywords(run.projectId),
  ])
  // KeywordTable 是 client component，Server→Client 边界只传可序列化的普通结构，不传 Map 实例。
  const keywordText = Object.fromEntries(
    keywords.map((k) => [k.id, { text: k.text, volume: k.searchVolume, difficulty: k.difficulty }]),
  )
  const isEmpty = !keywordMetrics.length && !keywordGaps.length
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
        <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
        {isEmpty ? (
          <div className="mt-4 flex flex-col gap-3">
            <EmptyStateCTA
              title={t('emptyGscTitle')}
              impact={t('emptyGscImpact')}
              actionLabel={t('emptyGscCta')}
              href={`/${locale}/projects/${run.projectId}`}
            />
            <EmptyStateCTA
              title={t('emptyDataforseoTitle')}
              impact={t('emptyDataforseoImpact')}
              actionLabel={t('emptyDataforseoCta')}
              href={`/${locale}/settings#source-dataforseo`}
            />
          </div>
        ) : (
          <div className="mt-4 report-table-wrap">
            <KeywordTable keywordMetrics={keywordMetrics} keywordGaps={keywordGaps} keywordText={keywordText} />
          </div>
        )}
      </section>
    </Shell>
  )
}
