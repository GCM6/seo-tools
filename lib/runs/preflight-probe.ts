// 运行前预检的实际探测（SP-A §4.5）：读项目与凭据、刷新一次 GSC token、调一次 DataForSEO 免费账户接口，
// 汇总成 PreflightProbe 交给纯逻辑 buildPreflight。所有外部依赖注入，便于测试；默认实现见 defaultPreflightDeps。

import { isValidCategory } from '@/lib/repositories/validators'
import { findMarket } from '@/lib/markets'
import { reasonOf } from '@/lib/collection/result'
import { GscAuthExpiredError, isGscPlatformConfigured, refreshAccessToken } from '@/lib/gsc/oauth'
import { readGscToken } from '@/lib/gsc/token-crypto'
import { resolveDataforseoCredentials } from '@/lib/credentials/dataforseo'
import { fetchDataforseoUserData, type DataforseoUserData } from '@/lib/dataforseo/user-data'
import { resolveCredentials } from '@/lib/credentials/store'
import { PROBE_CREDENTIAL_KEYS } from '@/lib/credentials/keys'
import { selectRenderProvider } from '@/lib/render/provider-selection'
import { buildProbeProviders } from '@/lib/probes/providers'
import { getProject, getProjectSettings } from '@/lib/repositories'
import type { PreflightProbe } from './preflight'

export interface PreflightProbeDeps {
  getProject: (id: string) => Promise<{ id: string; industry: string | null; market: string | null } | undefined>
  getProjectSettings: (projectId: string) => Promise<{ gscConnected: boolean; gscRefreshToken: string | null; gscSiteUrl: string | null } | undefined>
  isGscPlatformConfigured: () => boolean
  // 用存储的 refresh token 实际刷新一次；授权失效抛 GscAuthExpiredError（invalid_grant）。
  refreshGscToken: (storedRefreshToken: string) => Promise<void>
  resolveDataforseoCredentials: () => Promise<{ login: string; password: string } | null>
  fetchDataforseoUserData: (creds: { login: string; password: string }) => Promise<DataforseoUserData>
  hasPsiKey: () => Promise<boolean>
  isRenderConfigured: () => Promise<boolean>
  // 已配置 key 的 AI 探针引擎及其是否联网检索（记忆型如 DeepSeek 为 false）。
  listAiEngines: () => Promise<{ provider: string; webSearch: boolean }[]>
}

export async function probePreflight(projectId: string, deps: PreflightProbeDeps): Promise<PreflightProbe | null> {
  const project = await deps.getProject(projectId)
  if (!project) return null
  const settings = await deps.getProjectSettings(projectId)

  // GSC：与采集同一门槛（已授权 + 有 token + 已选站点）才实际刷新一次 token。
  const platformConfigured = deps.isGscPlatformConfigured()
  const connected = Boolean(settings?.gscConnected && settings.gscRefreshToken)
  const siteSelected = Boolean(settings?.gscSiteUrl)
  let gsc: PreflightProbe['gsc'] = { platformConfigured, connected, siteSelected, tokenOk: null }
  if (platformConfigured && connected && siteSelected && settings?.gscRefreshToken) {
    try {
      await deps.refreshGscToken(settings.gscRefreshToken)
      gsc = { ...gsc, tokenOk: true }
    } catch (err) {
      gsc = err instanceof GscAuthExpiredError
        ? { ...gsc, tokenOk: false, tokenError: 'invalid_grant' }
        : { ...gsc, tokenOk: null, tokenError: reasonOf(err) }
    }
  }

  const creds = await deps.resolveDataforseoCredentials()
  let dataforseo: PreflightProbe['dataforseo'] = { hasCredentials: false, authOk: null }
  if (creds) {
    const r = await deps.fetchDataforseoUserData(creds)
    dataforseo = r.ok
      ? { hasCredentials: true, authOk: true, balance: r.balance }
      : r.status === 401 || r.status === 403
        ? { hasCredentials: true, authOk: false, error: r.reason }
        : { hasCredentials: true, authOk: null, error: r.reason }
  }

  const [hasKey, renderConfigured, engines] = await Promise.all([deps.hasPsiKey(), deps.isRenderConfigured(), deps.listAiEngines()])
  return {
    categoryValid: isValidCategory(project.industry ?? ''),
    marketValid: Boolean(findMarket(project.market ?? '')),
    gsc,
    dataforseo,
    psi: { hasKey },
    render: { configured: renderConfigured },
    ai: { engines },
  }
}

export const defaultPreflightDeps: PreflightProbeDeps = {
  getProject: async (id) => getProject(id),
  getProjectSettings: async (projectId) => getProjectSettings(projectId),
  isGscPlatformConfigured: () => isGscPlatformConfigured(),
  refreshGscToken: async (stored) => {
    const token = readGscToken(stored)
    if (!token) throw new GscAuthExpiredError('gsc refresh token unreadable')
    await refreshAccessToken(token)
  },
  resolveDataforseoCredentials: () => resolveDataforseoCredentials(),
  fetchDataforseoUserData: (creds) => fetchDataforseoUserData(creds),
  // PAGESPEED_API_KEY 不在 BYOK 凭据清单里，只读 env（与 psi.ts 取 key 的口径一致）。
  hasPsiKey: async () => Boolean(process.env.PAGESPEED_API_KEY),
  isRenderConfigured: async () => {
    const provider = selectRenderProvider(await resolveCredentials(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'BROWSERLESS_API_TOKEN', 'BROWSERLESS_CONTENT_URL']))
    return provider.isConfigured?.() ?? true
  },
  listAiEngines: async () => {
    const providers = buildProbeProviders(await resolveCredentials(PROBE_CREDENTIAL_KEYS))
    return providers.filter((p) => p.isConfigured()).map((p) => ({ provider: p.id, webSearch: p.webSearchEnabled }))
  },
}
