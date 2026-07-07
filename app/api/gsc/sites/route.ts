import { NextResponse } from 'next/server'
import { getProjectSettings } from '@/lib/repositories'
import { readGscToken } from '@/lib/gsc/token-crypto'
import { refreshAccessToken } from '@/lib/gsc/oauth'
import { listSites } from '@/lib/gsc/search-analytics'

// GET /api/gsc/sites?projectId=... — 列出该项目 GSC 授权下的站点资源（供自动填站点 URL）。
// 未连接 / 无 token → { sites: [] }（优雅降级，不报错）；换令牌或拉取失败 → 502。
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'project_id_required' }, { status: 422 })

  const settings = await getProjectSettings(projectId)
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
