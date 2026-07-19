import { NextResponse } from 'next/server'
import { isGscPlatformConfigured, exchangeCodeForTokens, decodeOAuthState } from '@/lib/gsc/oauth'
import { setGscConnection } from '@/lib/repositories'

// GET /api/gsc/callback?code=...&state=<signed payload> — Google 授权回调。
// 仅接受平台签发、未过期 state；换得的 refresh_token 按项目加密存储。
export async function GET(req: Request) {
  if (!isGscPlatformConfigured()) {
    return NextResponse.json({ error: 'gsc_not_configured' }, { status: 400 })
  }
  const params = new URL(req.url).searchParams
  const code = params.get('code')
  const state = params.get('state')
  const oauthError = params.get('error') // 用户在同意页点了拒绝时 Google 回传 error

  if (oauthError) {
    return NextResponse.json({ error: 'gsc_auth_denied', detail: oauthError }, { status: 400 })
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'missing_code_or_state' }, { status: 400 })
  }
  const context = decodeOAuthState(state)
  if (!context) {
    return NextResponse.json({ error: 'invalid_oauth_state' }, { status: 400 })
  }

  try {
    const { refreshToken } = await exchangeCodeForTokens(code)
    // 重连后必须重新选择站点，避免旧 property 与新授权账号不匹配。
    await setGscConnection(context.projectId, { gscConnected: true, gscRefreshToken: refreshToken, gscSiteUrl: null })
  } catch (e) {
    return NextResponse.json(
      { error: 'gsc_token_exchange_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }

  const dest = context.returnTo
    ? `${context.returnTo}${context.returnTo.includes('?') ? '&' : '?'}gsc=connected`
    : `/projects/${context.projectId}?gsc=connected`
  return NextResponse.redirect(new URL(dest, req.url))
}
