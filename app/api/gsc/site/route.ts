import { NextResponse } from 'next/server'
import { setGscSiteUrl } from '@/lib/repositories'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; siteUrl?: string }
  if (!body.projectId) return NextResponse.json({ error: 'project_id_required' }, { status: 422 })
  if (!body.siteUrl?.trim()) return NextResponse.json({ error: 'site_url_required' }, { status: 422 })
  await setGscSiteUrl(body.projectId, body.siteUrl.trim())
  return NextResponse.json({ ok: true, siteUrl: body.siteUrl.trim() })
}
