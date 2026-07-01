import { NextResponse } from 'next/server'
import { getRun, getRunEvidence } from '@/lib/repositories'

// GET /runs/{id}/evidence（§7）—— 该 run 采集到的全部证据 artifact。
// 先校验 run 存在（404），避免对不存在的 run 静默返回空数组。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const items = await getRunEvidence(id)
  return NextResponse.json(items)
}
