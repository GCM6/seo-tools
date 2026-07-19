import { NextResponse } from 'next/server'
import { isGscPlatformConfigured, buildAuthUrl, encodeOAuthState, sanitizeReturnTo } from '@/lib/gsc/oauth'
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
  return NextResponse.redirect(buildAuthUrl(encodeOAuthState(projectId, returnTo)))
}
