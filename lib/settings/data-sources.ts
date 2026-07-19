// 数据源状态矩阵（设置页）。纯函数：env 记录 + 本项目 GSC 连接态入参 → 各源状态。
export type DataSourceKey =
  | 'gsc' | 'googleCse' | 'aiProbe' | 'dataforseo' | 'render' | 'psi' | 'publicCorpora'

export interface DataSourceStatus {
  key: DataSourceKey
  configured: boolean          // 环境/服务可用
  connected?: boolean          // 本项目可采集（仅 GSC：OAuth 已授权且已选择 property）
  detail?: string              // 附加信息（GSC 站点 URL / 已配探针数）
}

export interface GscConnection {
  gscAppConfigured: boolean    // isGscPlatformConfigured()——平台 OAuth 环境级
  gscConnected: boolean        // 本项目 OAuth 已授权（原始状态）
  gscSiteUrl: string | null
}

const AI_PROVIDER_ENVS = ['OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY']

export function buildDataSourceStatuses(
  env: Record<string, string | undefined>,
  gsc: GscConnection,
  dbConfiguredKeys: string[] = [],
): DataSourceStatus[] {
  // 「已配置」= env 有值 或 DB 凭据已录入（SP-G1c：DB>env 覆盖）。
  const has = (k: string) => !!env[k] || dbConfiguredKeys.includes(k)
  const aiCount = AI_PROVIDER_ENVS.filter(has).length
  const cloudflareReady = has('CLOUDFLARE_ACCOUNT_ID') && has('CLOUDFLARE_API_TOKEN')
  const browserlessReady = has('BROWSERLESS_API_TOKEN')
  return [
    {
      key: 'gsc',
      configured: gsc.gscAppConfigured,
      // token 仅代表 Google 账号已经授权；未选 property 时采集器仍会跳过，不能在健康度中冒充已就绪。
      connected: gsc.gscConnected && Boolean(gsc.gscSiteUrl),
      detail: gsc.gscSiteUrl ?? undefined,
    },
    { key: 'googleCse', configured: has('GOOGLE_CSE_API_KEY') && has('GOOGLE_CSE_CX') },
    { key: 'aiProbe', configured: aiCount > 0, detail: `${aiCount}/4` },
    { key: 'dataforseo', configured: has('DATAFORSEO_LOGIN') && has('DATAFORSEO_PASSWORD') },
    { key: 'render', configured: cloudflareReady || browserlessReady, detail: cloudflareReady ? 'Cloudflare' : browserlessReady ? 'Browserless' : undefined },
    { key: 'psi', configured: true },
    { key: 'publicCorpora', configured: true },
  ]
}
