import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { RunHistory, type RunHistoryItem } from '@/components/RunHistory'
import { GscConnectCard } from '@/components/GscConnectCard'
import { BrandAliasesCard } from '@/components/BrandAliasesCard'
import { RetestButton } from '@/components/RetestButton'
import { PageHeader } from '@/components/PageHeader'
import { SectionHeader } from '@/components/SectionHeader'
import { Notice } from '@/components/Notice'
import { ButtonLink } from '@/components/Button'
import { RelativeDate } from '@/components/RelativeDate'
import { marketLabel } from '@/lib/markets'
import { displayDomain } from '@/lib/runs/workspace'
import { getProject, getProjectRuns, getProjectSettings, getFindings } from '@/lib/repositories'
import { isGscPlatformConfigured, parseGscConnectError, gscRedirectOrigin } from '@/lib/gsc/oauth'
import { pickActiveRun, pickRetestAnchor } from '@/lib/projects/summary'

// 项目详情（ux-blueprint §2.2）：诊断历史（主体）→ 数据接入 + 品牌别名。项目不存在 → 路由级 404。
export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>
  // GSC 授权往返结果：/api/gsc/callback 或 /api/gsc/auth 跳回时带 ?gsc=connected | ?gsc_error=<code>
  searchParams: Promise<{ gsc_error?: string }>
}) {
  const { locale, id } = await params
  const gscConnectError = parseGscConnectError((await searchParams).gsc_error)
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

  // 每个 run 的发现数（V0 项目 run 数少，逐 run 计数可接受）。按时间倒序（开始时间优先，回落完成时间）。
  const runs: RunHistoryItem[] = (
    await Promise.all(
      runRows.map(async (r) => ({
        id: r.id,
        runType: r.runType,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        findingCount: (await getFindings(r.id)).length,
      })),
    )
  ).sort((a, b) => (b.startedAt ?? b.finishedAt ?? '').localeCompare(a.startedAt ?? a.finishedAt ?? ''))
  const domain = displayDomain(project.domain)

  // 页头动作只有一个主按钮：进行中 → 去看进度；可回测 → 发起回测（主）+ 重新配置；未配置 → 配置并分析。
  const actions = activeRun ? (
    <ButtonLink href={`/${locale}/runs/${activeRun.id}`} variant="primary">
      {tp('actionRunning')}
    </ButtonLink>
  ) : retestAnchor ? (
    <>
      <RetestButton
        locale={locale}
        baselineRunId={retestAnchor.id}
        className="ui-btn ui-btn--primary"
        labels={{
          cta: tp('actionRetest'),
          starting: tr('starting'),
          error: tr('error'),
          inProgress: tr('inProgress'),
          needsSetup: tr('needsSetup'),
        }}
      />
      <ButtonLink href={`/${locale}/new?projectId=${project.id}`}>{tp('actionReconfigure')}</ButtonLink>
    </>
  ) : (
    <ButtonLink href={`/${locale}/new?projectId=${project.id}`} variant="primary">
      {tp('actionConfigure')}
    </ButtonLink>
  )

  return (
    <section className="ui-page">
      <PageHeader
        crumbs={[{ label: tp('title'), href: `/${locale}/projects` }, { label: domain }]}
        title={domain}
        description={marketLabel(project.market, locale) ?? tp('marketUnset')}
        actions={actions}
      />

      <div className="grid grid-cols-1 gap-8">
        {project.nextRetestDueAt ? (
          <Notice>
            {t('retestDueLine')} <RelativeDate iso={project.nextRetestDueAt} locale={locale} />
          </Notice>
        ) : null}

        <section className="ui-section" aria-labelledby="project-runs">
          <SectionHeader id="project-runs" title={t('runHistoryTitle')} />
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
              timeUnknown: t('timeUnknown'),
              retestThis: t('retestThis'),
              retestStarting: tr('starting'),
              retestError: tr('error'),
              retestInProgress: tr('inProgress'),
              retestNeedsSetup: tr('needsSetup'),
            }}
            statusLabels={tp.raw('status') as Record<string, string>}
            runTypeLabels={tp.raw('runType') as Record<string, string>}
            hasActiveRun={activeRun !== null}
          />
        </section>

        <section className="ui-section" aria-labelledby="project-access">
          <SectionHeader id="project-access" title={t('dataAccessTitle')} />
          <div className="ui-split">
            <div id="gsc">
              <GscConnectCard
                projectId={project.id}
                locale={locale}
                gscConnected={settings?.gscConnected ?? false}
                gscSiteUrl={settings?.gscSiteUrl ?? null}
                gscAppConfigured={gscAppConfigured}
                connectError={gscConnectError}
                redirectOrigin={gscConnectError === 'redirect_port_mismatch' ? gscRedirectOrigin() : null}
              />
            </div>
            {/* 品牌别名（D7）：per-project 配置，随项目详情维护（全局设置页只管 BYOK 凭据）。 */}
            <BrandAliasesCard projectId={project.id} initialAliases={settings?.brandAliases ?? []} />
          </div>
        </section>
      </div>
    </section>
  )
}
