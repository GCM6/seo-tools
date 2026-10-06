import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state: { project: { id: string } | null } = { project: { id: 'proj_1' } }

vi.mock('@/lib/repositories', () => ({
  getProject: async () => state.project,
}))

const { GET } = await import('./route')

const env = {
  GOOGLE_OAUTH_CLIENT_ID: 'cid.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/api/gsc/callback',
  CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
}

const call = (origin: string, query: string) => GET(new Request(`${origin}/api/gsc/auth?${query}`))

describe('GET /api/gsc/auth', () => {
  beforeEach(() => {
    state.project = { id: 'proj_1' }
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('端口与回调地址一致 → 跳 Google 同意页', async () => {
    const res = await call('http://localhost:3000', 'projectId=proj_1&returnTo=%2Fzh%2Fprojects%2Fproj_1')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/)
  })

  it('应用跑在别的端口 → 不跳 Google，带错误码回到 returnTo（否则回调落到占用 3000 的别的应用 → 404）', async () => {
    const res = await call('http://localhost:3001', 'projectId=proj_1&returnTo=%2Fzh%2Fnew%3Fstep%3Dconnect%26projectId%3Dproj_1')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      'http://localhost:3001/zh/new?step=connect&projectId=proj_1&gsc_error=redirect_port_mismatch',
    )
  })

  it('项目不存在 → 404', async () => {
    state.project = null
    const res = await call('http://localhost:3000', 'projectId=nope')
    expect(res.status).toBe(404)
  })
})
