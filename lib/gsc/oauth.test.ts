import { describe, it, expect, vi } from 'vitest'
import { isGscConfigured, buildAuthUrl, exchangeCodeForTokens, refreshAccessToken, encodeOAuthState, decodeOAuthState, sanitizeReturnTo } from './oauth'

const fullEnv = {
  GOOGLE_OAUTH_CLIENT_ID: 'cid.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://veris.app/api/gsc/callback',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('isGscConfigured', () => {
  it('is true when all three env vars are present', () => {
    expect(isGscConfigured(fullEnv)).toBe(true)
  })

  it('is false when any env var is missing (graceful degradation)', () => {
    expect(isGscConfigured({})).toBe(false)
    expect(isGscConfigured({ ...fullEnv, GOOGLE_OAUTH_CLIENT_SECRET: undefined })).toBe(false)
    expect(isGscConfigured({ ...fullEnv, GOOGLE_OAUTH_REDIRECT_URI: '' })).toBe(false)
  })
})

describe('buildAuthUrl', () => {
  it('encodes read-only scope, offline access and consent prompt', () => {
    const url = new URL(buildAuthUrl('proj_123', fullEnv))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/webmasters.readonly')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe(fullEnv.GOOGLE_OAUTH_CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(fullEnv.GOOGLE_OAUTH_REDIRECT_URI)
    expect(url.searchParams.get('state')).toBe('proj_123')
  })
})

describe('exchangeCodeForTokens', () => {
  it('posts to token endpoint and parses refresh + access token', async () => {
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

  it('throws when Google omits refresh_token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'at_1', expires_in: 3599 }))
    await expect(exchangeCodeForTokens('c', fullEnv, fetchMock)).rejects.toThrow('no refresh_token')
  })

  it('throws with status on non-2xx', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400))
    await expect(exchangeCodeForTokens('c', fullEnv, fetchMock)).rejects.toThrow(/400 invalid_grant/)
  })
})

describe('refreshAccessToken', () => {
  it('exchanges refresh token for a fresh access token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: 'at_2', expires_in: 3599 }))
    const out = await refreshAccessToken('rt_1', fullEnv, fetchMock)

    const [, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    const body = new URLSearchParams(init.body as string)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('rt_1')
    expect(out).toEqual({ accessToken: 'at_2', expiresIn: 3599 })
  })

  it('throws when refresh fails', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400))
    await expect(refreshAccessToken('rt_1', fullEnv, fetchMock)).rejects.toThrow('gsc token refresh failed')
  })
})

describe('OAuth state 编解码 + returnTo 防开放重定向', () => {
  it('无 returnTo 时 state 就是 projectId，回落设置页流程不变', () => {
    const s = encodeOAuthState('proj_1')
    expect(s).toBe('proj_1')
    expect(decodeOAuthState(s)).toEqual({ projectId: 'proj_1', returnTo: null })
  })

  it('有 returnTo 时往返一致', () => {
    const s = encodeOAuthState('proj_1', '/zh?step=connect')
    expect(decodeOAuthState(s)).toEqual({ projectId: 'proj_1', returnTo: '/zh?step=connect' })
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
