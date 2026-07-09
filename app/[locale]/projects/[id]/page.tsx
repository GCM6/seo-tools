import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { RunHistory, type RunHistoryItem } from '@/components/RunHistory'
import { GscConnectCard } from '@/components/GscConnectCard'
import { getProject, getProjectRuns, getProjectSettings, getFindings } from '@/lib/repositories'
import { isGscConfigured } from '@/lib/gsc/oauth'

// 项目详情页（SP-G1b）：诊断历史 + 该项目 GSC 连接。项目不存在 → 路由级 404。
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const t = await getTranslations('projectDetail')
  // 状态/类型标签的真源在 projects 命名空间（列表页共用），此处复用同一套映射。
  const tp = await getTranslations('projects')

  const project = await getProject(id)
  if (!project) notFound()

  const [runRows, settings] = await Promise.all([getProjectRuns(id), getProjectSettings(id)])

  // 每个 run 的发现数（V0 项目 run 数少，逐 run 计数可接受）。按开始时间倒序展示。
  const runs: RunHistoryItem[] = (
    await Promise.all(
      runRows.map(async (r) => ({
        id: r.id,
        runType: r.runType,
        status: r.status,
        startedAt: r.startedAt,
        findingCount: (await getFindings(r.id)).length,
      })),
    )
  ).sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))

  return (
    <Shell active={1} locale={locale} domain={project.domain}>
      <section className="screen show">
        <div className="sec-h">
          <h1 className="text-lg font-semibold mono">{project.domain}</h1>
          <a className="run-btn" href={`/${locale}/new`}>
            {t('newRun')}
          </a>
        </div>

        {project.nextRetestDueAt ? (
          <p className="note">{t('retestDue', { date: project.nextRetestDueAt })}</p>
        ) : null}

        <h2 className="mt-6 text-sm font-medium">{t('runHistoryTitle')}</h2>
        <RunHistory
          locale={locale}
          runs={runs}
          labels={{
            colTime: t('colTime'),
            colType: t('colType'),
            colStatus: t('colStatus'),
            colFindings: t('colFindings'),
            colAction: t('colAction'),
            viewRun: t('viewRun'),
            viewReport: t('viewReport'),
            noRuns: t('noRuns'),
          }}
          statusLabels={tp.raw('status') as Record<string, string>}
          runTypeLabels={tp.raw('runType') as Record<string, string>}
        />

        <h2 className="mt-6 text-sm font-medium">{t('gscTitle')}</h2>
        <GscConnectCard
          projectId={project.id}
          projectDomain={project.domain}
          locale={locale}
          gscConnected={settings?.gscConnected ?? false}
          gscSiteUrl={settings?.gscSiteUrl ?? null}
          gscAppConfigured={isGscConfigured()}
        />
      </section>
    </Shell>
  )
}
