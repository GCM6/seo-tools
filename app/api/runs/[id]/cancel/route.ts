import { NextResponse } from 'next/server'
import { getRun, markRunStatus } from '@/lib/repositories'
import { RUN_CANCELLED_REASON } from '@/lib/runs/status'

// Inngest work already in flight cannot be force-killed from the browser. We
// terminally mark the run instead; markRunStatus then prevents late workers
// from changing a user-cancelled run back to collected/reviewing.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (run.status !== 'collecting' && run.status !== 'diagnosing') {
    return NextResponse.json({ error: 'not_running' }, { status: 409 })
  }

  await markRunStatus(id, 'failed', {
    failureReason: RUN_CANCELLED_REASON,
    finishedAt: new Date().toISOString(),
  })
  return NextResponse.json({ ok: true })
}
