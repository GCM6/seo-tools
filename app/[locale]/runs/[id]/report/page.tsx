import { setRequestLocale, getTranslations } from 'next-intl/server'
import { RunWorkspace } from '@/components/RunWorkspace'
import { ReportView } from '@/components/ReportView'
import { PrintButton } from './PrintButton'
import { ShareButton } from './ShareButton'
import { notFound } from 'next/navigation'
import { getRun } from '@/lib/repositories'

// 报告页 = 诊断工作区外壳 + 工具栏 + 共享 ReportView（与只读分享页共用同一套渲染，spec §SP-G1e-1）。
// 取数与渲染都在 ReportView 内；本页只做存在性检查与工具栏。
export default async function ReportPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const t = await getTranslations('report')

  // 不存在的 run 走路由级 404（ReportView 内部也会检查，这里先挡住，避免外壳先渲染）。
  const run = await getRun(id)
  if (!run) notFound()

  return (
    <RunWorkspace runId={id} locale={locale} current="report">
      <div className="report-toolbar no-print">
        <a className="ghost" href={`/api/runs/${id}/report?format=md`} download>
          {t('exportMd')}
        </a>
        <PrintButton label={t('print')} />
        <ShareButton
          runId={id}
          locale={locale}
          label={t('share')}
          copyLabel={t('shareCopy')}
          copiedLabel={t('shareCopied')}
          readyLabel={t('shareReady')}
        />
      </div>

      <ReportView runId={id} />
    </RunWorkspace>
  )
}
