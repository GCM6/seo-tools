import { setRequestLocale } from 'next-intl/server'
import { Shell } from '@/components/Shell'
import { NewAnalysisForm } from '@/components/NewAnalysisForm'
import { getPrimaryProject, getProjectSettings } from '@/lib/repositories'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'

// Screen 1 — 新建分析向导。Server Component：await params/searchParams（Next 16），
// 载入（V0 单）项目与数据源状态供向导预填/三态，把交互交给 client 向导。
// GSC 授权全页往返后回到 `/?step=connect&gsc=connected`：据此从第 2 步续起。
export default async function NewAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ step?: string; gsc?: string }>
}) {
  const { locale } = await params
  const { step, gsc } = await searchParams
  setRequestLocale(locale)

  const project = await getPrimaryProject()
  const [settings, statuses] = await Promise.all([
    project ? getProjectSettings(project.id) : Promise.resolve(null),
    loadDataSourceStatuses(),
  ])
  const aiProbeConfigured = statuses.find((s) => s.key === 'aiProbe')?.configured ?? false
  const gscConnected = settings?.gscConnected ?? false
  // 从 GSC 授权返回（step=connect 或 gsc=connected）时从第 2 步续起，否则第 1 步。
  const initialStep = step === 'connect' || gsc === 'connected' ? 2 : 1

  return (
    <Shell active={1} locale={locale}>
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
        aiProbeConfigured={aiProbeConfigured}
        initialStep={initialStep}
      />
    </Shell>
  )
}
