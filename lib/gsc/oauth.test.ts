import { describe, it, expect, vi } from 'vitest'
import {
  isGscPlatformConfigured,
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  encodeOAuthState,
  decodeOAuthState,
  sanitizeReturnTo,
  checkLoopbackRedirectPort,
  appendGscResult,
  parseGscConnectError,
  GscAuthExpiredError,
} from './oauth'

const fullEnv = {
  GOOGLE_OAUTH_CLIENT_ID: 'cid.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://veris.app/api/gsc/callback',
  CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('平台托管 GSC OAuth 配置', () => {
  it('只在平台环境变量与服务端加密主密钥齐全时就绪', () => {
    expect(isGscPlatformConfigured(fullEnv)).toBe(true)
    expect(isGscPlatformConfigured({})).toBe(false)
    expect(isGscPlatformConfigured({ ...fullEnv, GOOGLE_OAUTH_CLIENT_SECRET: undefined })).toBe(false)
    expect(isGscPlatformConfigured({ ...fullEnv, CREDENTIALS_ENCRYPTION_KEY: 'not-a-32-byte-key' })).toBe(false)
  })
})

describe('buildAuthUrl', () => {
  it('编码只读 scope、离线 access 与平台回调地址', () => {
    const url = new URL(buildAuthUrl('signed_state', fullEnv))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/webmasters.readonly')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe(fullEnv.GOOGLE_OAUTH_CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(fullEnv.GOOGLE_OAUTH_REDIRECT_URI)
    expect(url.searchParams.get('state')).toBe('signed_state')
  })
})

describe('exchangeCodeForTokens', () => {
  it('用平台 secret 换取 refresh + access token', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ refresh_token: 'rt_1', access_token: 'at_1', expires_in: 3599 }),
    )
    const tokens = await exchangeCodeForTokens('auth_code', fullEnv, fetchMock)

    const [url, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(init.method).toBe('POST')
    const body = new URLSearchParams(init.body as string)
    expect(body.get('code')).toBe('auth_code')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('client_secret')).toBe('secret')
    expect(tokens).toEqual({ refreshToken: 'rt_1', accessToken: 'at_1', expiresIn: 3599 })
  })

  it('Google 未返回 refresh_token 时明确失败', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'at_1', expires_in: 3599 }))
    await expect(exchangeCodeForTokens('c', fullEnv, fetchMock)).rejects.toThrow('no refresh_token')
  })

  it('非 2xx 时带上 Google 状态码失败', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400))
    await expect(exchangeCodeForTokens('c', fullEnv, fetchMock)).rejects.toThrow(/400 invalid_grant/)
  })
})

describe('refreshAccessToken', () => {
  it('用项目 refresh token 换取短期 access token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'at_2', expires_in: 3599 }))
    const out = await refreshAccessToken('rt_1', fullEnv, fetchMock)

    const [, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    const body = new URLSearchParams(init.body as string)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('rt_1')
    expect(out).toEqual({ accessToken: 'at_2', expiresIn: 3599 })
  })

  it('刷新失败时抛出明确错误', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400))
    await expect(refreshAccessToken('rt_1', fullEnv, fetchMock)).rejects.toThrow('gsc token refresh failed')
  })

  it('invalid_grant（授权被撤销/过期）抛出可识别的 GscAuthExpiredError，其它失败不是', async () => {
    const expired = vi.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400))
    await expect(refreshAccessToken('rt_1', fullEnv, expired)).rejects.toBeInstanceOf(GscAuthExpiredError)
    const outage = vi.fn(async () => jsonResponse({ error: 'internal_failure' }, 500))
    await expect(refreshAccessToken('rt_1', fullEnv, outage)).rejects.not.toBeInstanceOf(GscAuthExpiredError)
  })
})

describe('OAuth state 签名、过期与返回路径', () => {
  it('签名 state 往返项目与站内 returnTo', () => {
    const state = encodeOAuthState('proj_1', '/zh/new?step=connect', fullEnv, 100)
    expect(decodeOAuthState(state, fullEnv, 200)).toEqual({ projectId: 'proj_1', returnTo: '/zh/new?step=connect' })
  })

  it('拒绝被篡改、过期或使用另一把平台密钥的 state', () => {
    const state = encodeOAuthState('proj_1', '/zh/projects/proj_1', fullEnv, 100)
    expect(decodeOAuthState(`${state}x`, fullEnv, 200)).toBeNull()
    expect(decodeOAuthState(state, fullEnv, 100 + 10 * 60 * 1000 + 1)).toBeNull()
    expect(decodeOAuthState(state, { ...fullEnv, CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64') }, 200)).toBeNull()
  })

  it('签名时只保留站内 returnTo，外部地址不能进入 state', () => {
    const state = encodeOAuthState('proj_1', 'https://evil.example', fullEnv, 100)
    expect(decodeOAuthState(state, fullEnv, 200)).toEqual({ projectId: 'proj_1', returnTo: null })
  })

  it('sanitizeReturnTo 只放行站内相对路径', () => {
    expect(sanitizeReturnTo('/zh?step=connect')).toBe('/zh?step=connect')
    expect(sanitizeReturnTo('https://evil.com')).toBeNull()
    expect(sanitizeReturnTo('//evil.com')).toBeNull()
    expect(sanitizeReturnTo('javascript:alert(1)')).toBeNull()
    expect(sanitizeReturnTo(null)).toBeNull()
    expect(sanitizeReturnTo('')).toBeNull()
    expect(sanitizeReturnTo('relative/no/slash')).toBeNull()
  })
})

describe('checkLoopbackRedirectPort', () => {
  const localEnv = { ...fullEnv, GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/api/gsc/callback' }

  it('本地回调端口与当前访问端口不同 → 拦下（回调会落到占用该端口的别的应用）', () => {
    expect(checkLoopbackRedirectPort('http://localhost:3001/api/gsc/auth?projectId=p', localEnv)).toEqual({
      ok: false,
      expected: 'http://localhost:3000',
      actual: 'http://localhost:3001',
    })
  })

  it('同端口的 loopback 别名（127.0.0.1 / localhost）视为同一服务，放行', () => {
    expect(checkLoopbackRedirectPort('http://localhost:3000/api/gsc/auth', localEnv)).toEqual({ ok: true })
    expect(checkLoopbackRedirectPort('http://127.0.0.1:3000/api/gsc/auth', localEnv)).toEqual({ ok: true })
  })

  it('非 loopback 回调（生产域名）或配置缺失时不拦截', () => {
    expect(checkLoopbackRedirectPort('https://preview.vercel.app/api/gsc/auth', fullEnv)).toEqual({ ok: true })
    expect(checkLoopbackRedirectPort('http://localhost:3001/api/gsc/auth', {})).toEqual({ ok: true })
  })
})

describe('appendGscResult / parseGscConnectError', () => {
  it('在 returnTo 上追加结果参数，保留原有 query', () => {
    expect(appendGscResult('/zh/new?step=connect&projectId=p1', { gsc: 'connected' })).toBe(
      '/zh/new?step=connect&projectId=p1&gsc=connected',
    )
    expect(appendGscResult('/zh/projects/p1', { gsc_error: 'access_denied' })).toBe('/zh/projects/p1?gsc_error=access_denied')
  })

  it('只接受白名单错误码，其余一律忽略（query 可被任意拼接）', () => {
    expect(parseGscConnectError('redirect_port_mismatch')).toBe('redirect_port_mismatch')
    expect(parseGscConnectError('access_denied')).toBe('access_denied')
    expect(parseGscConnectError('token_exchange_failed')).toBe('token_exchange_failed')
    expect(parseGscConnectError('<script>')).toBeNull()
    expect(parseGscConnectError(undefined)).toBeNull()
  })
})
