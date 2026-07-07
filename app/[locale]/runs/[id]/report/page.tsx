import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { ReportView } from '@/components/ReportView'
import { PrintButton } from './PrintButton'
import { ShareButton } from './ShareButton'
import { getRun, getProject } from '@/lib/repositories'

// 报告页 = Shell + 工具栏 + 共享 ReportView（与只读分享页共用同一套渲染，spec §SP-G1e-1）。
// 取数与渲染都在 ReportView 内；本页只补 Shell 顶栏所需的 domain 与工具栏。
export default async function ReportPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const t = await getTranslations('report')

  // Shell 顶栏 domain：轻量取 run→project（ReportView 会各自完整取数，此处仅 chrome）。
  const run = await getRun(id)
  const project = run ? await getProject(run.projectId) : undefined

  return (
    <Shell active={4} locale={locale} runId={id} domain={project?.domain}>
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
    </Shell>
  )
}
