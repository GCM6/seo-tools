import Link from 'next/link'
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { RunHistory, type RunHistoryItem } from '@/components/RunHistory'
import { GscConnectCard } from '@/components/GscConnectCard'
import { BrandAliasesCard } from '@/components/BrandAliasesCard'
import { RetestButton } from '@/components/RetestButton'
import { getProject, getProjectRuns, getProjectSettings, getFindings } from '@/lib/repositories'
import { isGscPlatformConfigured } from '@/lib/gsc/oauth'
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

  const [runRows, settings] = await Promise.all([
    getProjectRuns(id),
    getProjectSettings(id),
  ])
  const gscAppConfigured = isGscPlatformConfigured()

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
        <h1 className="project-detail-title">{project.domain}</h1>
        {activeRun ? (
          <Link href={`/${locale}/runs/${activeRun.id}`} className="run-btn !mt-0">
            {tp('actionRunning')}
          </Link>
        ) : retestAnchor ? (
          <span className="sec-h-actions">
            <RetestButton
              locale={locale}
              baselineRunId={retestAnchor.id}
              className="run-btn !mt-0"
              labels={{
                cta: tp('actionRetest'),
                starting: tr('starting'),
                error: tr('error'),
                inProgress: tr('inProgress'),
              }}
            />
            <Link href={`/${locale}/new?projectId=${project.id}`} className="ghost-btn !mt-0">
              {tp('actionReconfigure')}
            </Link>
          </span>
        ) : (
          <Link href={`/${locale}/new?projectId=${project.id}`} className="run-btn !mt-0">
            {tp('actionConfigure')}
          </Link>
        )}
      </div>

      {project.nextRetestDueAt ? (
        <p className="note">{t('retestDue', { date: project.nextRetestDueAt })}</p>
      ) : null}

      <h2 className="project-detail-section-title">{t('dataAccessTitle')}</h2>
      <div id="gsc" className="mt-3">
        <GscConnectCard
          projectId={project.id}
          locale={locale}
          gscConnected={settings?.gscConnected ?? false}
          gscSiteUrl={settings?.gscSiteUrl ?? null}
          gscAppConfigured={gscAppConfigured}
        />
      </div>

      <h2 className="project-detail-section-title">{t('runHistoryTitle')}</h2>
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
          viewOutput: t('viewOutput'),
          confirmRecs: t('confirmRecs'),
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

      <div className="mt-6 flex flex-col gap-6">
        {/* 品牌别名（D7）：project_settings.brandAliases 是 per-project 配置，随项目详情页维护
            （不放全局设置页——SP-G1b 已把设置页明确收窄为不绑定单项目的 BYOK 凭据页）。 */}
        <BrandAliasesCard projectId={project.id} initialAliases={settings?.brandAliases ?? []} />
      </div>
    </section>
  )
}
