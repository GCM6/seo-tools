import { NextResponse } from 'next/server'
import { isGscConfigured, exchangeCodeForTokens, decodeOAuthState, sanitizeReturnTo } from '@/lib/gsc/oauth'
import { setGscConnection } from '@/lib/repositories'

// GET /api/gsc/callback?code=...&state=<projectId[::returnTo]> — Google 授权回调。
// 换取 refresh_token 落库，随后跳回来源：向导（state 带 returnTo）或设置页（默认）。
// 未配 env / 用户拒绝授权 / 换令牌失败 → 返回 JSON 错误，不崩溃。
export async function GET(req: Request) {
  if (!isGscConfigured()) {
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
  const { projectId, returnTo } = decodeOAuthState(state)
  if (!projectId) {
    return NextResponse.json({ error: 'missing_code_or_state' }, { status: 400 })
  }

  try {
    const { refreshToken } = await exchangeCodeForTokens(code)
    await setGscConnection(projectId, { gscConnected: true, gscRefreshToken: refreshToken })
  } catch (e) {
    return NextResponse.json(
      { error: 'gsc_token_exchange_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }

  // 单项目内部工具：有向导返回路径则跳回向导闭环，否则回落设置页并标记已连接。
  // next-intl 中间件补 locale 前缀。returnTo 再过一次 sanitize 防篡改开放重定向。
  const safeReturn = sanitizeReturnTo(returnTo)
  const dest = safeReturn
    ? `${safeReturn}${safeReturn.includes('?') ? '&' : '?'}gsc=connected`
    : '/settings?gsc=connected'
  return NextResponse.redirect(new URL(dest, req.url))
}
