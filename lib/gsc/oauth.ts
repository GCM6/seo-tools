// GSC OAuth2（read-only）纯函数层 —— 直接打 Google 端点，不引 googleapis 依赖。
// Vercel serverless 友好：无长连接、无本地状态。未配 env 时 isGscConfigured() 为 false，
// 上层路由据此降级返回 400，绝不崩溃。仅在服务端使用——client_secret / refresh_token 不得下发客户端。

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
// read-only：只读 Search Console，符合 CLAUDE.md「GSC 一律 OAuth read-only」铁律。
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

type Env = Record<string, string | undefined>

interface OAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

// 从 env 读三件套；缺任一即视为未配置。默认读 process.env，测试可注入。
function readConfig(env: Env = process.env): OAuthConfig {
  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI ?? '',
  }
}

export function isGscConfigured(env: Env = process.env): boolean {
  const c = readConfig(env)
  return Boolean(c.clientId && c.clientSecret && c.redirectUri)
}

// 构造同意页跳转 URL。state 承载 projectId，回调时原样带回做 CSRF/上下文校验。
// access_type=offline + prompt=consent 才能拿到可长期续期的 refresh_token。
export function buildAuthUrl(state: string, env: Env = process.env): string {
  const c = readConfig(env)
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export interface ExchangedTokens {
  refreshToken: string
  accessToken: string
  expiresIn: number
}

// 授权码换令牌。fetchImpl 可注入以便测试；默认全局 fetch。
export async function exchangeCodeForTokens(
  code: string,
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ExchangedTokens> {
  const c = readConfig(env)
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })
  const body = (await res.json().catch(() => ({}))) as GoogleTokenResponse
  if (!res.ok) {
    throw new Error(`gsc token exchange failed: ${res.status} ${body.error ?? ''}`.trim())
  }
  if (!body.refresh_token) {
    // 用户此前已授权且未 prompt=consent 时 Google 会省略 refresh_token；这里明确报错，
    // 促使上层重新以 prompt=consent 拉起授权，避免存下无法续期的连接。
    throw new Error('gsc token exchange returned no refresh_token')
  }
  return {
    refreshToken: body.refresh_token,
    accessToken: body.access_token ?? '',
    expiresIn: body.expires_in ?? 0,
  }
}

export interface RefreshedToken {
  accessToken: string
  expiresIn: number
}

// 用长期 refresh_token 换短期 access_token（每次采集前调）。
export async function refreshAccessToken(
  refreshToken: string,
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<RefreshedToken> {
  const c = readConfig(env)
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  })
  const body = (await res.json().catch(() => ({}))) as GoogleTokenResponse
  if (!res.ok || !body.access_token) {
    throw new Error(`gsc token refresh failed: ${res.status} ${body.error ?? ''}`.trim())
  }
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 0 }
}
