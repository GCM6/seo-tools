import { NextResponse } from 'next/server'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'
import { previewSite } from '@/lib/analysis/site-preview'

// POST /api/site-preview — 向导品类候选（SP-A §3.2，只读不落库）。域名非法 422；抓取失败照样 200 + error 短码。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { domain?: string }
  const domain = normalizeDomain(body.domain?.trim() ?? '')
  if (!domain) return NextResponse.json({ error: 'invalid_domain' }, { status: 422 })
  return NextResponse.json(await previewSite(domain))
}
