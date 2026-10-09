import { NextResponse } from 'next/server'
import { getRun } from '@/lib/repositories'
import { startCheckup } from '@/lib/runs/start-checkup'

// POST /runs/{id}/retest —— 兼容旧入口：对该体检所属项目发起一次体检（spec D3：不再区分基线/回测，
// 沿用还是新建协议由协议指纹决定）。响应形状保持 { baselineRunId, retest }（RetestButton 读 retest.id）。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clicked = await getRun(id)
  if (!clicked) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const result = await startCheckup({ projectId: clicked.projectId })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.runId ? { runId: result.runId } : {}), ...(result.projectId ? { projectId: result.projectId } : {}) },
      { status: result.status },
    )
  }
  return NextResponse.json({ baselineRunId: result.run.baselineRunId ?? id, retest: result.run }, { status: 201 })
}
