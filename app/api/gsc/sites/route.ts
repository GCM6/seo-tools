import { NextResponse } from 'next/server'
import { getProject, getProjectSettings } from '@/lib/repositories'
import { readGscToken } from '@/lib/gsc/token-crypto'
import { isGscPlatformConfigured, refreshAccessToken } from '@/lib/gsc/oauth'
import { listSites } from '@/lib/gsc/search-analytics'

// GET /api/gsc/sites?projectId=... — 列出该项目 GSC 授权下的站点资源（供用户选择 property）。
// 未连接 / 无 token → { sites: [] }（优雅降级，不报错）；换令牌或拉取失败 → 502。
export async function GET(req: Request) {
  if (!isGscPlatformConfigured()) {
    return NextResponse.json({ error: 'gsc_not_configured' }, { status: 400 })
  }
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'project_id_required' }, { status: 422 })

  const [project, settings] = await Promise.all([getProject(projectId), getProjectSettings(projectId)])
  if (!project) return NextResponse.json({ error: 'project_not_found' }, { status: 404 })
  const refreshToken = readGscToken(settings?.gscRefreshToken)
  if (!settings?.gscConnected || !refreshToken) return NextResponse.json({ sites: [] })

  try {
    const { accessToken } = await refreshAccessToken(refreshToken)
    const sites = await listSites(accessToken)
    return NextResponse.json({ sites })
  } catch (e) {
    return NextResponse.json(
      { error: 'gsc_sites_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
