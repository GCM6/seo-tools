import Link from 'next/link'
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { RunHistory, type RunHistoryItem } from '@/components/RunHistory'
import { GscConnectCard } from '@/components/GscConnectCard'
import { RetestButton } from '@/components/RetestButton'
import { getProject, getProjectRuns, getProjectSettings, getFindings } from '@/lib/repositories'
import { isGscConfigured } from '@/lib/gsc/oauth'
import { pickActiveRun, pickRetestAnchor } from '@/lib/projects/summary'

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
  const tr = await getTranslations('retest')

  const project = await getProject(id)
  if (!project) notFound()

  const [runRows, settings] = await Promise.all([getProjectRuns(id), getProjectSettings(id)])

  // 页头三态操作组的判定（spec §2.1 修订）：与 listProjectsWithSummary 用同一对纯函数，
  // 直接吃已取的 runRows，不额外查库。
  const activeRun = pickActiveRun(runRows)
  const retestAnchor = pickRetestAnchor(runRows)

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
    <section className="screen show">
      <div className="sec-h">
        <h1 className="text-lg font-semibold mono">{project.domain}</h1>
        {activeRun ? (
          <Link href={`/${locale}/runs/${activeRun.id}`} className="run-btn">
            {tp('actionRunning')}
          </Link>
        ) : retestAnchor ? (
          <span className="sec-h-actions">
            <RetestButton
              locale={locale}
              baselineRunId={retestAnchor.id}
              labels={{
                cta: tp('actionRetest'),
                starting: tr('starting'),
                error: tr('error'),
                inProgress: tr('inProgress'),
              }}
            />
            <Link href={`/${locale}/new?projectId=${project.id}`} className="ghost-btn">
              {tp('actionReconfigure')}
            </Link>
          </span>
        ) : (
          <Link href={`/${locale}/new?projectId=${project.id}`} className="run-btn">
            {tp('actionConfigure')}
          </Link>
        )}
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
          retestThis: t('retestThis'),
          retestStarting: tr('starting'),
          retestError: tr('error'),
          retestInProgress: tr('inProgress'),
        }}
        statusLabels={tp.raw('status') as Record<string, string>}
        runTypeLabels={tp.raw('runType') as Record<string, string>}
        hasActiveRun={activeRun !== null}
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
  )
}
