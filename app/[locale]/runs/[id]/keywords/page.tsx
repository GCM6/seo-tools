import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { RunWorkspace } from '@/components/RunWorkspace'
import { KeywordTable } from '@/components/KeywordTable'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { ButtonLink } from '@/components/Button'
import { getRun, getRunKeywordMetrics, getRunKeywordGaps, getKeywords } from '@/lib/repositories'

// 关键词现状（ux-blueprint §3.6 原始数据）：区段标题 → 关键词表（GSC 实测 + DataForSEO 缺口合并为一行）。
// 两个数据源都没有数据时，分别说明缺什么、去哪接入。
export default async function KeywordsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [t, run] = await Promise.all([getTranslations('keywords'), getRun(id)])
  if (!run) notFound()
  const [keywordMetrics, keywordGaps, keywords] = await Promise.all([
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
    <RunWorkspace runId={id} locale={locale} current="keywords">
      <section className="ui-section">
        <SectionHeader title={t('title')} note={t('subtitle')} />
        {isEmpty ? (
          <div className="ui-empty-pair">
            <EmptyState
              title={t('emptyGscTitle')}
              description={t('emptyGscImpact')}
              action={
                <ButtonLink href={`/${locale}/projects/${run.projectId}#gsc`} size="sm">
                  {t('emptyGscCta')}
                </ButtonLink>
              }
            />
            <EmptyState
              title={t('emptyDataforseoTitle')}
              description={t('emptyDataforseoImpact')}
              action={
                <ButtonLink href={`/${locale}/settings#source-dataforseo`} size="sm">
                  {t('emptyDataforseoCta')}
                </ButtonLink>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <KeywordTable keywordMetrics={keywordMetrics} keywordGaps={keywordGaps} keywordText={keywordText} />
          </div>
        )}
      </section>
    </RunWorkspace>
  )
}
