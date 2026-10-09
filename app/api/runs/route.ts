import { NextResponse } from 'next/server'
import { startCheckup } from '@/lib/runs/start-checkup'

// POST /runs —— 发起一次体检（spec 2026-10-09 §5.3）。基线/回测由协议指纹决定，请求体里的 runType 不再生效。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { projectId?: string }
  const projectId = body.projectId?.trim()
  if (!projectId) return NextResponse.json({ error: 'project_id_required' }, { status: 422 })

  const result = await startCheckup({ projectId, legacySession: true })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.runId ? { runId: result.runId } : {}), ...(result.projectId ? { projectId: result.projectId } : {}) },
      { status: result.status },
    )
  }
  return NextResponse.json(result.run, { status: 201 })
}
