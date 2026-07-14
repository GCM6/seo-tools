import { setRequestLocale } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { NewAnalysisForm } from '@/components/NewAnalysisForm'
import { getProject, getProjectSettings } from '@/lib/repositories'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'

// 读实时项目/数据源状态（GSC 往返续起在建项目）：动态渲染。
export const dynamic = 'force-dynamic'

// 新建分析向导（SP-G1b：从旧首页迁来）。始终新鲜项目——不再复用 getPrimaryProject。
// GSC 授权全页往返回到 `/<locale>/new?step=connect&projectId=<id>&gsc=connected`：
// 据 searchParams.projectId 显式载入在建项目并从第 2 步续起。
export default async function NewAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ step?: string; gsc?: string; projectId?: string }>
}) {
  const { locale } = await params
  const { step, gsc, projectId } = await searchParams
  setRequestLocale(locale)

  // 仅当从 GSC 往返带回 projectId 时载入该在建项目（续起授权闭环）；否则从零开始。
  const project = projectId ? await getProject(projectId) : null
  const [settings, statuses] = await Promise.all([
    project ? getProjectSettings(project.id) : Promise.resolve(null),
    loadDataSourceStatuses(project?.id),
  ])
  const aiProbeConfigured = statuses.find((s) => s.key === 'aiProbe')?.configured ?? false
  const gscAppConfigured = statuses.find((s) => s.key === 'gsc')?.configured ?? false
  const gscConnected = settings?.gscConnected ?? false
  const initialStep = step === 'connect' || gsc === 'connected' ? 2 : 1

  return (
    <Shell>
      <NewAnalysisForm
        locale={locale}
        project={
          project
            ? {
                id: project.id,
                domain: project.domain,
                industry: project.industry ?? '',
                market: project.market ?? '',
                language: project.language ?? '',
                competitors: project.competitors ?? [],
              }
            : null
        }
        gscConnected={gscConnected}
        gscAppConfigured={gscAppConfigured}
        aiProbeConfigured={aiProbeConfigured}
        initialStep={initialStep}
        savedEngines={settings?.defaultModels ?? null}
      />
    </Shell>
  )
}
