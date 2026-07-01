import { NextResponse } from 'next/server'
import { getRun, getRetestSnapshots } from '@/lib/repositories'

// GET /runs/{id}/delta（§7）—— 以 baseline run 为锚返回回测 delta（retest_snapshots）。
// 桩：demo baseline 尚无回测，返回空数组（形状与真实版一致）。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const snapshots = await getRetestSnapshots(id)
  return NextResponse.json(snapshots)
}
