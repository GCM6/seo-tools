import { describe, it, expect, vi } from 'vitest'
import { probePreflight, type PreflightProbeDeps } from './preflight-probe'
import { GscAuthExpiredError } from '@/lib/gsc/oauth'

function deps(over: Partial<PreflightProbeDeps> = {}): PreflightProbeDeps {
  return {
    getProject: vi.fn(async (id: string) => (id === 'proj_1' ? { id: 'proj_1', industry: 'document metadata removal tool', market: 'global-en' } : undefined)),
    getProjectSettings: vi.fn(async () => ({ gscConnected: true, gscRefreshToken: 'v1.cipher', gscSiteUrl: 'sc-domain:metadocu.com' })),
    isGscPlatformConfigured: vi.fn(() => true),
    refreshGscToken: vi.fn(async () => undefined),
    resolveDataforseoCredentials: vi.fn(async () => ({ login: 'u', password: 'p' })),
    fetchDataforseoUserData: vi.fn(async () => ({ ok: true as const, balance: 12.34 })),
    hasPsiKey: vi.fn(async () => true),
    isRenderConfigured: vi.fn(async () => true),
    listAiEngines: vi.fn(async () => [{ provider: 'openai', webSearch: true }]),
    ...over,
  }
}

describe('probePreflight（SP-A §4.5 实际探测，依赖注入）', () => {
  it('未知项目 → null', async () => {
    expect(await probePreflight('nope', deps())).toBeNull()
  })

  it('全部正常：探测结果原样汇总', async () => {
    expect(await probePreflight('proj_1', deps())).toEqual({
      categoryValid: true, marketValid: true,
      gsc: { platformConfigured: true, connected: true, siteSelected: true, tokenOk: true },
      dataforseo: { hasCredentials: true, authOk: true, balance: 12.34 },
      psi: { hasKey: true }, render: { configured: true },
      ai: { engines: [{ provider: 'openai', webSearch: true }] },
    })
  })

  it('GSC：invalid_grant → tokenOk false；其他刷新错误 → tokenOk null 并带错误', async () => {
    const expired = await probePreflight('proj_1', deps({ refreshGscToken: vi.fn(async () => { throw new GscAuthExpiredError() }) }))
    expect(expired?.gsc).toMatchObject({ tokenOk: false, tokenError: 'invalid_grant' })
    const flaky = await probePreflight('proj_1', deps({ refreshGscToken: vi.fn(async () => { throw new TypeError('fetch failed') }) }))
    expect(flaky?.gsc).toMatchObject({ tokenOk: null, tokenError: 'network_error' })
  })

  it('GSC 未连接或未选站点时不刷新 token', async () => {
    const refreshGscToken = vi.fn(async () => undefined)
    const r = await probePreflight('proj_1', deps({ refreshGscToken, getProjectSettings: vi.fn(async () => ({ gscConnected: true, gscRefreshToken: 'v1.cipher', gscSiteUrl: null })) }))
    expect(r?.gsc).toEqual({ platformConfigured: true, connected: true, siteSelected: false, tokenOk: null })
    expect(refreshGscToken).not.toHaveBeenCalled()
  })

  it('DataForSEO：401 → authOk false；网络错误 → authOk null；无凭据不发请求', async () => {
    const denied = await probePreflight('proj_1', deps({ fetchDataforseoUserData: vi.fn(async () => ({ ok: false as const, status: 401, reason: 'http_401' })) }))
    expect(denied?.dataforseo).toEqual({ hasCredentials: true, authOk: false, error: 'http_401' })
    const offline = await probePreflight('proj_1', deps({ fetchDataforseoUserData: vi.fn(async () => ({ ok: false as const, status: null, reason: 'network_error' })) }))
    expect(offline?.dataforseo).toEqual({ hasCredentials: true, authOk: null, error: 'network_error' })
    const fetchUserData = vi.fn(async () => ({ ok: true as const, balance: 1 }))
    const none = await probePreflight('proj_1', deps({ resolveDataforseoCredentials: vi.fn(async () => null), fetchDataforseoUserData: fetchUserData }))
    expect(none?.dataforseo).toEqual({ hasCredentials: false, authOk: null })
    expect(fetchUserData).not.toHaveBeenCalled()
  })

  it('旧项目（品类空、市场为旧文案）→ 品类与市场都无效', async () => {
    const r = await probePreflight('proj_1', deps({ getProject: vi.fn(async () => ({ id: 'proj_1', industry: '', market: 'English · Global' })) }))
    expect(r).toMatchObject({ categoryValid: false, marketValid: false })
  })
})
