import { getProjectSettings, getConfiguredCredentialKeys } from '@/lib/repositories'
import { isGscConfigured } from '@/lib/gsc/oauth'
import { buildDataSourceStatuses, type DataSourceStatus } from './data-sources'

// 服务端：拼装数据源状态矩阵。传 projectId 时含该项目真实 GSC 连接态（项目详情 / run 页用）；
// 省略时为全局视角（settings 页 BYOK 矩阵），GSC 一律未连接——连接按项目在项目详情页操作。
// 其余源按 env/DB 凭据判定，与项目无关。（spec §SP-G1b / §SP-G2b-2）
export async function loadDataSourceStatuses(projectId?: string): Promise<DataSourceStatus[]> {
  const settings = projectId ? await getProjectSettings(projectId) : null
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
