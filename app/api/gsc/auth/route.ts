import { NextResponse } from 'next/server'
import { isGscConfigured, buildAuthUrl, encodeOAuthState, sanitizeReturnTo } from '@/lib/gsc/oauth'

// GET /api/gsc/auth?projectId=...&returnTo=/<locale>?step=connect — 拉起 Google 同意页。
// 未配 OAuth env 时降级 400，不崩溃（CLAUDE.md：未配置须优雅降级）。
// projectId 与可选的向导返回路径编进 OAuth state 透传，回调原样带回：
// 有 returnTo 跳回向导闭环，无则回落设置页（既有流程不变）。（spec §SP-G2a-4）
export async function GET(req: Request) {
  if (!isGscConfigured()) {
    return NextResponse.json({ error: 'gsc_not_configured' }, { status: 400 })
  }
  const params = new URL(req.url).searchParams
  const projectId = params.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id_required' }, { status: 422 })
  }
  const returnTo = sanitizeReturnTo(params.get('returnTo'))
  return NextResponse.redirect(buildAuthUrl(encodeOAuthState(projectId, returnTo)))
}
