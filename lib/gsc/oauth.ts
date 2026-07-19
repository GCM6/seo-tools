// GSC OAuth2（read-only）平台托管层 —— OAuth Client 是 Veris 的服务端配置，
// 不属于任一用户或项目的 BYOK 凭据。项目仅保存用户同意后签发的 refresh_token。
// 仅在服务端使用——client_secret / refresh_token 不得下发客户端。

import { createHmac, timingSafeEqual } from 'node:crypto'

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

interface OAuthStatePayload {
  projectId: string
  returnTo: string | null
  expiresAt: number
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

// 平台运营方在部署环境中配置唯一的 OAuth Client；不从 provider_credentials 读取，
// 避免项目/普通用户设置页可以修改平台 client_secret。（平台托管 OAuth 架构）
export function readGscPlatformConfig(env: Env = process.env): OAuthConfig {
  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI ?? '',
  }
}

function readStateKey(env: Env = process.env): Buffer | null {
  const key = Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY ?? '', 'base64')
  return key.length === 32 ? key : null
}

// 平台 OAuth 与项目 token 使用同一把服务端主密钥：它既签名短时 state，
// 也加密项目 refresh token；缺任一项时入口统一保持不可用。
export function isGscPlatformConfigured(env: Env = process.env): boolean {
  const c = readGscPlatformConfig(env)
  return Boolean(c.clientId && c.clientSecret && c.redirectUri && readStateKey(env))
}

// 构造同意页跳转 URL。
// access_type=offline + prompt=consent 才能拿到可长期续期的 refresh_token。
export function buildAuthUrl(state: string, env: Env = process.env): string {
  const c = readGscPlatformConfig(env)
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

function signState(payload: string, key: Buffer): string {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

// state 带项目上下文、站内返回路径与 10 分钟过期时间，并以服务端主密钥 HMAC 签名。
// 这避免把可篡改的 projectId 直接交给 Google 往返，也拒绝过期重放。
export function encodeOAuthState(
  projectId: string,
  returnTo: string | null = null,
  env: Env = process.env,
  now = Date.now(),
): string {
  const key = readStateKey(env)
  if (!key) throw new Error('gsc_oauth_state_key_missing')
  const body: OAuthStatePayload = {
    projectId,
    returnTo: sanitizeReturnTo(returnTo),
    expiresAt: now + OAUTH_STATE_TTL_MS,
  }
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  return `${payload}.${signState(payload, key)}`
}

export function decodeOAuthState(
  state: string,
  env: Env = process.env,
  now = Date.now(),
): { projectId: string; returnTo: string | null } | null {
  const key = readStateKey(env)
  const [payload, signature, ...extra] = state.split('.')
  if (!key || !payload || !signature || extra.length) return null
  const expected = signState(payload, key)
  const suppliedBytes = Buffer.from(signature, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<OAuthStatePayload>
    if (typeof parsed.projectId !== 'string' || !parsed.projectId || typeof parsed.expiresAt !== 'number' || parsed.expiresAt < now) {
      return null
    }
    const returnTo = typeof parsed.returnTo === 'string' ? sanitizeReturnTo(parsed.returnTo) : null
    if (parsed.returnTo !== null && parsed.returnTo !== undefined && returnTo === null) return null
    return { projectId: parsed.projectId, returnTo }
  } catch {
    return null
  }
}

// 只放行站内绝对路径（以单个 `/` 开头），挡掉开放重定向（协议相对 `//`、
// 绝对 URL、javascript: 等）。回调据此决定跳向导还是回落设置页。
export function sanitizeReturnTo(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  if (/[\x00-\x1f]/.test(raw)) return null
  return raw
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
  const c = readGscPlatformConfig(env)
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
  const c = readGscPlatformConfig(env)
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
