import { NextResponse } from 'next/server'
import { getRun, getRetestSnapshots, getSiteAuditEvidence } from '@/lib/repositories'
import { diffSiteAudits } from '@/lib/crawl/audit-diff'
import type { SiteAuditPayload } from '@/lib/crawl/site-audit'

// GET /runs/{id}/delta（§7）—— 以 baseline run 为锚返回回测 delta（retest_snapshots）。
// 带 ?compareRunId= 时追加两次 site_audit 快照的对比；不带时保持旧响应形状（纯数组）。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const snapshots = await getRetestSnapshots(id)

  const compareRunId = new URL(req.url).searchParams.get('compareRunId')
  if (!compareRunId) return NextResponse.json(snapshots)

  const [baseAudit, retestAudit] = await Promise.all([getSiteAuditEvidence(id), getSiteAuditEvidence(compareRunId)])
  const siteAuditDiff =
    baseAudit?.payload && retestAudit?.payload
      ? diffSiteAudits(baseAudit.payload as SiteAuditPayload, retestAudit.payload as SiteAuditPayload)
      : null
  return NextResponse.json({ snapshots, siteAuditDiff })
}
