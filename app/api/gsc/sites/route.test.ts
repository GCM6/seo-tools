import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh: { impl: () => Promise<{ accessToken: string; expiresIn: number }> } = {
  impl: async () => ({ accessToken: 'at', expiresIn: 3600 }),
}

vi.mock('@/lib/repositories', () => ({
  getProject: async () => ({ id: 'proj_1' }),
  getProjectSettings: async () => ({ gscConnected: true, gscRefreshToken: 'enc' }),
}))
vi.mock('@/lib/gsc/token-crypto', () => ({ readGscToken: () => 'rt_1' }))
vi.mock('@/lib/gsc/search-analytics', () => ({ listSites: async () => ['sc-domain:example.com'] }))
vi.mock('@/lib/gsc/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gsc/oauth')>()
  return { ...actual, isGscPlatformConfigured: () => true, refreshAccessToken: () => refresh.impl() }
})

const { GET } = await import('./route')
const { GscAuthExpiredError } = await import('@/lib/gsc/oauth')
const call = () => GET(new Request('http://localhost:3000/api/gsc/sites?projectId=proj_1'))

describe('GET /api/gsc/sites', () => {
  beforeEach(() => {
    refresh.impl = async () => ({ accessToken: 'at', expiresIn: 3600 })
  })
  afterEach(() => vi.restoreAllMocks())

  it('列出授权站点', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sites: ['sc-domain:example.com'] })
  })

  it('refresh_token 已失效（invalid_grant）→ 409 gsc_reauth_required，提示用户重新授权', async () => {
    refresh.impl = async () => {
      throw new GscAuthExpiredError()
    }
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('gsc_reauth_required')
  })

  it('其它上游失败仍是 502', async () => {
    refresh.impl = async () => {
      throw new Error('gsc token refresh failed: 500 internal_failure')
    }
    expect((await call()).status).toBe(502)
  })
})
