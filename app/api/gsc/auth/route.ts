import { NextResponse } from 'next/server'
import { isGscConfigured, buildAuthUrl } from '@/lib/gsc/oauth'

// GET /api/gsc/auth?projectId=... — 拉起 Google 同意页。
// 未配 OAuth env 时降级 400，不崩溃（CLAUDE.md：未配置须优雅降级）。
// projectId 作为 OAuth state 透传，回调时原样带回以定位项目。
export async function GET(req: Request) {
  if (!isGscConfigured()) {
    return NextResponse.json({ error: 'gsc_not_configured' }, { status: 400 })
  }
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id_required' }, { status: 422 })
  }
  return NextResponse.redirect(buildAuthUrl(projectId))
}
