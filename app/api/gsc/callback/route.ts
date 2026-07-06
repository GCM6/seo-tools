import { NextResponse } from 'next/server'
import { isGscConfigured, exchangeCodeForTokens } from '@/lib/gsc/oauth'
import { setGscConnection } from '@/lib/repositories'

// GET /api/gsc/callback?code=...&state=<projectId> — Google 授权回调。
// 换取 refresh_token 并落库到 project_settings，随后跳回设置页并带上连接状态。
// 未配 env / 用户拒绝授权 / 换令牌失败 → 返回 JSON 错误，不崩溃。
export async function GET(req: Request) {
  if (!isGscConfigured()) {
    return NextResponse.json({ error: 'gsc_not_configured' }, { status: 400 })
  }
  const params = new URL(req.url).searchParams
  const code = params.get('code')
  const projectId = params.get('state')
  const oauthError = params.get('error') // 用户在同意页点了拒绝时 Google 回传 error

  if (oauthError) {
    return NextResponse.json({ error: 'gsc_auth_denied', detail: oauthError }, { status: 400 })
  }
  if (!code || !projectId) {
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

  // 单项目内部工具跳回设置页并标记已连接；设置页用 getPrimaryProject() 解析项目，next-intl 中间件补 locale 前缀。
  return NextResponse.redirect(new URL('/settings?gsc=connected', req.url))
}
