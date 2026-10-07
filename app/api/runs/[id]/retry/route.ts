import { NextResponse } from 'next/server'
import { getRun, getProject, markRunStatus } from '@/lib/repositories'
import { inngest } from '@/lib/inngest/client'
import { buildCollectRequestedEvent } from '@/lib/inngest/events'
import { runGateError } from '@/lib/runs/gate'

// 失败采集 run 重试：重置 collecting 并重派采集事件（与 POST /runs 派发同构）。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (run.status !== 'failed') return NextResponse.json({ error: 'not_failed' }, { status: 409 })
  // 回测的基线 id 自 0018 起存在 runs 表，重试时随事件带上，保证同协议（验收新发现 5）。
  // 迁移前建的旧回测没有存基线：重派会丢掉基线、按当前项目重建问句，变成不同协议——仍不支持直接重试（最终审查 F5-1）。
  if (run.runType === 'retest' && !run.baselineRunId) return NextResponse.json({ error: 'retest_retry_unsupported', projectId: run.projectId }, { status: 409 })
  const project = await getProject(run.projectId)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  // SP-A §3.5 闸门：品类/市场无效不得重派采集。
  const gate = runGateError(project)
  if (gate) return NextResponse.json({ error: gate, projectId: project.id }, { status: 422 })

  await markRunStatus(id, 'collecting', { failureReason: null, allowCancelled: true })
  try {
    await inngest.send(buildCollectRequestedEvent(run, project.domain, run.baselineRunId ?? undefined))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await markRunStatus(id, 'failed', { failureReason: `采集事件派发失败：${reason}`, finishedAt: new Date().toISOString() })
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
