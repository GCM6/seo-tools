import { getProjectSettings, getConfiguredCredentialKeys } from '@/lib/repositories'
import { isGscPlatformConfigured } from '@/lib/gsc/oauth'
import { buildDataSourceStatuses, type DataSourceStatus } from './data-sources'

// 服务端：拼装数据源状态矩阵。传 projectId 时含该项目真实 GSC 可采集态；
// 省略 projectId 时不读取任何项目的 GSC 状态——全局页只使用其中的共享服务项。
// 凭据与 property 始终只归属各自项目，不能被“任一项目已连接”提升为全局状态。
export async function loadDataSourceStatuses(projectId?: string): Promise<DataSourceStatus[]> {
  const [settings, dbKeys] = await Promise.all([
    projectId ? getProjectSettings(projectId) : Promise.resolve(null),
    getConfiguredCredentialKeys(),
  ])
  return buildDataSourceStatuses(
    process.env,
    {
      gscAppConfigured: isGscPlatformConfigured(),
      gscConnected: settings?.gscConnected ?? false,
      gscSiteUrl: settings?.gscSiteUrl ?? null,
    },
    dbKeys,
  )
}
