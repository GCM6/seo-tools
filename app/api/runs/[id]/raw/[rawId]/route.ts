import { NextResponse } from 'next/server'
import { getEvidenceRawById } from '@/lib/repositories'
import { unpackRaw } from '@/lib/collection/raw-store'

// GET /api/runs/{id}/raw/{rawId}（SP-A §4.3）——解压后的第三方原始响应（含失败响应），按 run 隔离。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; rawId: string }> }) {
  const { id, rawId } = await params
  const row = await getEvidenceRawById(id, rawId)
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return new Response(unpackRaw(row.content), {
    headers: {
      'content-type': row.contentType ?? 'text/plain; charset=utf-8',
      'x-raw-truncated': String(row.truncated),
      'x-raw-sha256': row.sha256,
    },
  })
}
