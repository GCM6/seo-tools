import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Shell } from '@/components/Shell'
import { KeywordTable } from '@/components/KeywordTable'
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
  const keywordText = new Map(
    keywords.map((k) => [k.id, { text: k.text, volume: k.searchVolume, difficulty: k.difficulty }]),
  )
  const isEmpty = !keywordMetrics.length && !keywordGaps.length
  return (
    <Shell active={2} locale={locale} runId={id} domain={project?.domain}>
      <section className="screen show">
        <h1 className="text-lg font-semibold">
          {project?.domain} · {t('title')}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{t('subtitle')}</p>
        {isEmpty ? (
          <p className="mt-4 text-sm">
            {t('empty')}{' '}
            <Link href={`/${locale}/settings`} className="underline underline-offset-2">
              {t('emptyCta')}
            </Link>
          </p>
        ) : (
          <div className="mt-4">
            <KeywordTable keywordMetrics={keywordMetrics} keywordGaps={keywordGaps} keywordText={keywordText} />
          </div>
        )}
      </section>
    </Shell>
  )
}
