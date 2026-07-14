import { NextResponse } from 'next/server'
import { getRun, getProject, markRunStatus } from '@/lib/repositories'
import { inngest } from '@/lib/inngest/client'
import { buildCollectRequestedEvent } from '@/lib/inngest/events'

// 失败采集 run 重试：重置 collecting 并重派采集事件（与 POST /runs 派发同构）。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (run.status !== 'failed') return NextResponse.json({ error: 'not_failed' }, { status: 409 })
  const project = await getProject(run.projectId)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await markRunStatus(id, 'collecting', { failureReason: null, allowCancelled: true })
  try {
    await inngest.send(buildCollectRequestedEvent(run, project.domain))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await markRunStatus(id, 'failed', { failureReason: `采集事件派发失败：${reason}`, finishedAt: new Date().toISOString() })
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
