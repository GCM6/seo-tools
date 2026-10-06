import { NextResponse } from 'next/server'
import {
  isGscPlatformConfigured,
  buildAuthUrl,
  encodeOAuthState,
  sanitizeReturnTo,
  checkLoopbackRedirectPort,
  appendGscResult,
} from '@/lib/gsc/oauth'
import { getProject } from '@/lib/repositories'

// GET /api/gsc/auth?projectId=...&returnTo=/<locale>?step=connect — 拉起 Google 同意页。
// OAuth Client 是平台环境变量；项目上下文签名后封入短时 state，回调原样验证。
export async function GET(req: Request) {
  if (!isGscPlatformConfigured()) {
    return NextResponse.json({ error: 'gsc_not_configured' }, { status: 400 })
  }
  const params = new URL(req.url).searchParams
  const projectId = params.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id_required' }, { status: 422 })
  }
  if (!(await getProject(projectId))) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 })
  }
  const returnTo = sanitizeReturnTo(params.get('returnTo'))

  // 本地回调端口 ≠ 当前应用端口时，Google 会把用户送到别的应用（404）。
  // 在跳 Google 之前拦下，带错误码回原页面，由页面说明原因与修法。
  if (!checkLoopbackRedirectPort(req.url).ok) {
    const back = appendGscResult(returnTo ?? `/projects/${projectId}`, { gsc_error: 'redirect_port_mismatch' })
    return NextResponse.redirect(new URL(back, req.url))
  }
  return NextResponse.redirect(buildAuthUrl(encodeOAuthState(projectId, returnTo)))
}
