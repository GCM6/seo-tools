import { NextResponse } from 'next/server'
import { getRun, getActiveShareForRun, createReportShare } from '@/lib/repositories'

// POST /api/runs/{id}/share?locale=zh — 生成（或复用未过期的）只读分享链接。
// 幂等：同一 run 未过期分享直接复用，避免每次点都堆链接。返回相对 url，前端拼 origin。
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const locale = new URL(req.url).searchParams.get('locale') === 'en' ? 'en' : 'zh'
  const now = new Date()
  const share = (await getActiveShareForRun(id, now)) ?? (await createReportShare(id, locale))

  return NextResponse.json({ token: share.token, url: `/share/${share.token}` }, { status: 201 })
}
