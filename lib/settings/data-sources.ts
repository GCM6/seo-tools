// 数据源状态矩阵（设置页）。纯函数：env 记录 + 本项目 GSC 连接态入参 → 各源状态。
export type DataSourceKey =
  | 'gsc' | 'googleCse' | 'aiProbe' | 'dataforseo' | 'render' | 'psi' | 'publicCorpora'

export interface DataSourceStatus {
  key: DataSourceKey
  configured: boolean          // 环境/服务可用
  connected?: boolean          // 本项目已授权（仅 GSC）
  detail?: string              // 附加信息（GSC 站点 URL / 已配探针数）
}

export interface GscConnection {
  gscAppConfigured: boolean    // isGscConfigured()——OAuth app 环境级
  gscConnected: boolean        // 本项目 settings.gscConnected
  gscSiteUrl: string | null
}

const AI_PROVIDER_ENVS = ['OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY']

export function buildDataSourceStatuses(
  env: Record<string, string | undefined>,
  gsc: GscConnection,
): DataSourceStatus[] {
  const aiCount = AI_PROVIDER_ENVS.filter((k) => !!env[k]).length
  return [
    { key: 'gsc', configured: gsc.gscAppConfigured, connected: gsc.gscConnected, detail: gsc.gscSiteUrl ?? undefined },
    { key: 'googleCse', configured: !!(env.GOOGLE_CSE_API_KEY && env.GOOGLE_CSE_CX) },
    { key: 'aiProbe', configured: aiCount > 0, detail: `${aiCount}/4` },
    { key: 'dataforseo', configured: !!(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD) },
    { key: 'render', configured: !!(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) },
    { key: 'psi', configured: true },
    { key: 'publicCorpora', configured: true },
  ]
}
