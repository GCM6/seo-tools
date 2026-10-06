import { NextResponse } from 'next/server'
import { getEvidenceRawsByEvidenceId } from '@/lib/repositories'

// GET /api/evidence/{id}/raw（SP-A §4.3）——该证据对应的原始响应清单（一条证据可来自多次请求）。
// 只回元数据与下钻链接；正文按条从 /api/runs/{runId}/raw/{rawId} 取，避免一次回传多 MB 内容。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await getEvidenceRawsByEvidenceId(id)
  if (rows.length === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      sourceKey: r.sourceKey,
      httpStatus: r.httpStatus,
      contentType: r.contentType,
      byteLength: r.byteLength,
      truncated: r.truncated,
      sha256: r.sha256,
      href: `/api/runs/${r.runId}/raw/${r.id}`,
    })),
  })
}
