import { NextResponse } from 'next/server'
import { getProject, getProjectSettings, setGscSiteUrl } from '@/lib/repositories'
import { readGscToken } from '@/lib/gsc/token-crypto'
import { isGscPlatformConfigured, refreshAccessToken } from '@/lib/gsc/oauth'
import { listSites } from '@/lib/gsc/search-analytics'

export async function POST(req: Request) {
  if (!isGscPlatformConfigured()) {
    return NextResponse.json({ error: 'gsc_not_configured' }, { status: 400 })
  }
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; siteUrl?: string }
  if (!body.projectId) return NextResponse.json({ error: 'project_id_required' }, { status: 422 })
  if (!body.siteUrl?.trim()) return NextResponse.json({ error: 'site_url_required' }, { status: 422 })
  const siteUrl = body.siteUrl.trim()
  const [project, settings] = await Promise.all([getProject(body.projectId), getProjectSettings(body.projectId)])
  if (!project) return NextResponse.json({ error: 'project_not_found' }, { status: 404 })

  const refreshToken = readGscToken(settings?.gscRefreshToken)
  if (!settings?.gscConnected || !refreshToken) {
    return NextResponse.json({ error: 'gsc_not_connected' }, { status: 409 })
  }

  try {
    const { accessToken } = await refreshAccessToken(refreshToken)
    const sites = await listSites(accessToken)
    if (!sites.includes(siteUrl)) {
      return NextResponse.json({ error: 'gsc_site_not_authorized' }, { status: 422 })
    }
  } catch (e) {
    return NextResponse.json(
      { error: 'gsc_sites_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }

  await setGscSiteUrl(body.projectId, siteUrl)
  return NextResponse.json({ ok: true, siteUrl })
}
