import { NextResponse } from 'next/server'
import { isGscPlatformConfigured, exchangeCodeForTokens, decodeOAuthState, appendGscResult } from '@/lib/gsc/oauth'
import { setGscConnection } from '@/lib/repositories'

// GET /api/gsc/callback?code=...&state=<signed payload> — Google 授权回调。
// 仅接受平台签发、未过期 state；换得的 refresh_token 按项目加密存储。
// 这是浏览器全页跳转的落点：凡能从 state 取到可信 returnTo 的结果（成功/拒绝/换令牌失败）
// 都跳回原页面并以 query 带结果，由页面渲染提示；不给用户看裸 JSON。
export async function GET(req: Request) {
  if (!isGscPlatformConfigured()) {
    return NextResponse.json({ error: 'gsc_not_configured' }, { status: 400 })
  }
  const params = new URL(req.url).searchParams
  const code = params.get('code')
  const state = params.get('state')
  const oauthError = params.get('error') // 用户在同意页点了拒绝时 Google 回传 error
  const context = state ? decodeOAuthState(state) : null

  const back = (ctx: { projectId: string; returnTo: string | null }, result: Record<string, string>) =>
    NextResponse.redirect(new URL(appendGscResult(ctx.returnTo ?? `/projects/${ctx.projectId}`, result), req.url))

  if (oauthError) {
    if (!context) {
      return NextResponse.json({ error: 'gsc_auth_denied', detail: oauthError }, { status: 400 })
    }
    return back(context, { gsc_error: oauthError === 'access_denied' ? 'access_denied' : 'oauth_error' })
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'missing_code_or_state' }, { status: 400 })
  }
  if (!context) {
    return NextResponse.json({ error: 'invalid_oauth_state' }, { status: 400 })
  }

  try {
    const { refreshToken } = await exchangeCodeForTokens(code)
    // 重连后必须重新选择站点，避免旧 property 与新授权账号不匹配。
    await setGscConnection(context.projectId, { gscConnected: true, gscRefreshToken: refreshToken, gscSiteUrl: null })
  } catch (e) {
    console.error('gsc_token_exchange_failed', e instanceof Error ? e.message : String(e))
    return back(context, { gsc_error: 'token_exchange_failed' })
  }

  return back(context, { gsc: 'connected' })
}
