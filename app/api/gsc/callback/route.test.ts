import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const saved: { projectId: string; patch: Record<string, unknown> }[] = []
const exchange: { impl: () => Promise<{ refreshToken: string; accessToken: string; expiresIn: number }> } = {
  impl: async () => ({ refreshToken: 'rt_new', accessToken: 'at', expiresIn: 3600 }),
}

vi.mock('@/lib/repositories', () => ({
  setGscConnection: async (projectId: string, patch: Record<string, unknown>) => {
    saved.push({ projectId, patch })
  },
}))
vi.mock('@/lib/gsc/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gsc/oauth')>()
  return { ...actual, exchangeCodeForTokens: () => exchange.impl() }
})

const { GET } = await import('./route')
const { encodeOAuthState } = await import('@/lib/gsc/oauth')

const env = {
  GOOGLE_OAUTH_CLIENT_ID: 'cid.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/api/gsc/callback',
  CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
}

const call = (query: string) => GET(new Request(`http://localhost:3000/api/gsc/callback?${query}`))
const stateFor = (returnTo: string | null) => encodeURIComponent(encodeOAuthState('proj_1', returnTo))

describe('GET /api/gsc/callback', () => {
  beforeEach(() => {
    saved.length = 0
    exchange.impl = async () => ({ refreshToken: 'rt_new', accessToken: 'at', expiresIn: 3600 })
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('授权成功 → 保存令牌并回到向导（带 gsc=connected）', async () => {
    const res = await call(`code=c1&state=${stateFor('/zh/new?step=connect&projectId=proj_1')}`)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/zh/new?step=connect&projectId=proj_1&gsc=connected')
    expect(saved).toEqual([
      { projectId: 'proj_1', patch: { gscConnected: true, gscRefreshToken: 'rt_new', gscSiteUrl: null } },
    ])
  })

  it('无 returnTo 时回落到项目详情页', async () => {
    const res = await call(`code=c1&state=${stateFor(null)}`)
    expect(res.headers.get('location')).toBe('http://localhost:3000/projects/proj_1?gsc=connected')
  })

  it('用户在同意页拒绝 → 回到原页面并提示，而不是裸 JSON', async () => {
    const res = await call(`error=access_denied&state=${stateFor('/zh/projects/proj_1')}`)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/zh/projects/proj_1?gsc_error=access_denied')
    expect(saved).toEqual([])
  })

  it('换令牌失败 → 回到原页面并提示，不落库', async () => {
    exchange.impl = async () => {
      throw new Error('gsc token exchange failed: 400 invalid_grant')
    }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call(`code=c1&state=${stateFor('/zh/projects/proj_1')}`)
    expect(res.headers.get('location')).toBe('http://localhost:3000/zh/projects/proj_1?gsc_error=token_exchange_failed')
    expect(saved).toEqual([])
    errSpy.mockRestore()
  })

  it('state 无效 / 缺失 → 400（无可信 returnTo，不跳转）', async () => {
    expect((await call('code=c1&state=forged.sig')).status).toBe(400)
    expect((await call('code=c1')).status).toBe(400)
  })
})
