import { getPrimaryProject, getProjectSettings, getConfiguredCredentialKeys } from '@/lib/repositories'
import { isGscConfigured } from '@/lib/gsc/oauth'
import { buildDataSourceStatuses, type DataSourceStatus } from './data-sources'

// 服务端：拼装当前（V0 单）项目的数据源状态矩阵。settings 页与顶栏健康度 pill 共用，
// 避免重复拼装。无项目时 GSC 一律未连接，其余源仍按 env/DB 凭据判定。（spec §SP-G2b-2）
export async function loadDataSourceStatuses(): Promise<DataSourceStatus[]> {
  const project = await getPrimaryProject()
  const settings = project ? await getProjectSettings(project.id) : null
  const dbKeys = await getConfiguredCredentialKeys()
  return buildDataSourceStatuses(
    process.env,
    {
      gscAppConfigured: isGscConfigured(),
      gscConnected: settings?.gscConnected ?? false,
      gscSiteUrl: settings?.gscSiteUrl ?? null,
    },
    dbKeys,
  )
}
