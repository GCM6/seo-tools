import { NextResponse } from 'next/server'
import { buildPreflight } from '@/lib/runs/preflight'
import { defaultPreflightDeps, probePreflight } from '@/lib/runs/preflight-probe'

// POST /api/projects/{id}/preflight（SP-A §4.5）：运行前预检——实际探测各数据源（刷新一次 GSC token、
// 调一次 DataForSEO 免费账户接口），返回预检项清单。只读，不写任何状态；建 run 仍只做品类/市场闸门。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const probe = await probePreflight(id, defaultPreflightDeps)
  if (!probe) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ items: buildPreflight(probe) })
}
