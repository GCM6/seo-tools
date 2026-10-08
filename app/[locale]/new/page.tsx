import { getTranslations, setRequestLocale } from 'next-intl/server'
import { PageHeader } from '@/components/PageHeader'
import { NewAnalysisModes } from '@/components/NewAnalysisModes'
import { NewAnalysisForm } from '@/components/NewAnalysisForm'
import { GoalAnalysisLauncher } from '@/components/GoalAnalysisLauncher'
import { getProject, getProjectSettings } from '@/lib/repositories'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'
import { parseGscConnectError, gscRedirectOrigin } from '@/lib/gsc/oauth'
import { wizardProjectProps } from '@/lib/projects/wizard-project'

// 读实时项目/数据源状态（GSC 往返续起在建项目）：动态渲染。
export const dynamic = 'force-dynamic'

// 新建分析（ux-blueprint §4）：页头 + 二选一的开始方式（诊断一个网站 / 从一个问题开始）。
// 始终新鲜项目——不再复用 getPrimaryProject。GSC 授权全页往返回到
// `/<locale>/new?step=connect&projectId=<id>&gsc=connected`：据 searchParams.projectId 显式载入在建项目并从第 2 步续起。
export default async function NewAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ step?: string; gsc?: string; gsc_error?: string; projectId?: string }>
}) {
  const { locale } = await params
  const { step, gsc, gsc_error, projectId } = await searchParams
  const gscConnectError = parseGscConnectError(gsc_error)
  setRequestLocale(locale)

  // 仅当从 GSC 往返带回 projectId 时载入该在建项目（续起授权闭环）；否则从零开始。
  const project = projectId ? await getProject(projectId) : null
  const [settings, statuses, t] = await Promise.all([
    project ? getProjectSettings(project.id) : Promise.resolve(null),
    loadDataSourceStatuses(project?.id),
    getTranslations('newAnalysis'),
  ])
  const aiProbeConfigured = statuses.find((s) => s.key === 'aiProbe')?.configured ?? false
  const dataforseoConfigured = statuses.find((s) => s.key === 'dataforseo')?.configured ?? false
  const gscAppConfigured = statuses.find((s) => s.key === 'gsc')?.configured ?? false
  const gscConnected = settings?.gscConnected ?? false
  const initialStep = step === 'connect' || gsc === 'connected' ? 2 : 1

  return (
    <section className="ui-page">
      <PageHeader title={t('title')} description={t('description')} />
      <NewAnalysisModes
        labels={{ label: t('modeLabel'), site: t('modeSite'), goal: t('modeGoal') }}
        site={
          <NewAnalysisForm
            locale={locale}
            project={wizardProjectProps(project, settings)}
            gscConnected={gscConnected}
            gscSiteUrl={settings?.gscSiteUrl ?? null}
            gscAppConfigured={gscAppConfigured}
            aiProbeConfigured={aiProbeConfigured}
            dataforseoConfigured={dataforseoConfigured}
            initialStep={initialStep}
            savedEngines={settings?.defaultModels ?? null}
            gscConnectError={gscConnectError}
            gscRedirectOrigin={gscConnectError === 'redirect_port_mismatch' ? gscRedirectOrigin() : null}
          />
        }
        goal={<GoalAnalysisLauncher locale={locale} />}
      />
    </section>
  )
}
