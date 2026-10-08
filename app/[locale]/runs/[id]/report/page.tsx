import { setRequestLocale, getTranslations } from 'next-intl/server'
import { RunWorkspace } from '@/components/RunWorkspace'
import { buttonClass } from '@/components/Button'
import { ReportView } from '@/components/ReportView'
import { PrintButton } from './PrintButton'
import { ShareButton } from './ShareButton'
import { notFound } from 'next/navigation'
import { getRun } from '@/lib/repositories'

// 报告页 = 诊断工作区外壳 + 工具条 + 共享 ReportView（与只读分享页是同一份文档，ux-blueprint §3.5）。
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
      <div className="ui-doc-toolbar" role="toolbar" aria-label={t('toolbar')}>
        {/* 导出走 API 下载，不用 next/link（会预取 API 路由） */}
        <a className={buttonClass({ size: 'sm' })} href={`/api/runs/${id}/report?format=md`} download>
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
          errorLabel={t('shareError')}
        />
      </div>

      <ReportView runId={id} locale={locale} variant="workspace" />
    </RunWorkspace>
  )
}
