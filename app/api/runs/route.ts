import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { runs } from '@/db/schema'
import { getProject, markRunStatus, findActiveRun } from '@/lib/repositories'
import { inngest } from '@/lib/inngest/client'
import { buildCollectRequestedEvent } from '@/lib/inngest/events'
import { RULES_VERSION } from '@/lib/diagnosis/types'
import { runGateError } from '@/lib/runs/gate'

const VALID_RUN_TYPE = ['baseline', 'retest'] as const

// POST /runs — 新建一次诊断 run（§7）。projectId 必填且须存在。
// 建 run 即置 status=collecting 并向 Inngest 派发采集事件，由 collectEvidence 函数接管。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string
    runType?: string
  }
  const projectId = body.projectId?.trim()
  const runType = body.runType ?? 'baseline'

  if (!projectId) return NextResponse.json({ error: 'project_id_required' }, { status: 422 })
  if (!VALID_RUN_TYPE.includes(runType as (typeof VALID_RUN_TYPE)[number]))
    return NextResponse.json({ error: 'invalid_run_type' }, { status: 422 })

  const project = await getProject(projectId)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // SP-A §3.5 闸门：品类/市场无效不得启动（也就不会触发任何付费采集）。界面据错误码引导回向导第 1 步。
  const gate = runGateError(project)
  if (gate) return NextResponse.json({ error: gate }, { status: 422 })

  // 同项目并发保护（spec §2.3）：已有进行中 run 时拒绝创建，不插入不派发。
  const active = await findActiveRun(projectId)
  if (active) return NextResponse.json({ error: 'run_in_progress', runId: active.id }, { status: 409 })

  const [created] = await db
    .insert(runs)
    .values({
      id: `run_${crypto.randomUUID()}`,
      projectId,
      runType,
      status: 'collecting',
      rulesVersion: RULES_VERSION,
      // 与回测路由同语义：创建即开始。项目列表「最近诊断」与回测锚点按它排序。
      startedAt: new Date().toISOString(),
    })
    .returning()

  // 兼容旧入口：诊断行为不变，但尽力补建知识脑会话并冻结知识/工作流/规则配置版本。
  // 失败不阻断旧采集链，便于尚未执行 0013 migration 的本地环境继续工作。
  try {
    const { createLegacySessionForRun } = await import('@/lib/knowledge/repository')
    await createLegacySessionForRun({ runId: created.id, project })
  } catch (error) {
    console.warn('legacy_session_bridge_failed', error instanceof Error ? error.message : String(error))
  }

  // 派发失败（如本地 Inngest dev server 未启动）时不能让 run 卡死在
  // collecting：标记 failed 并返回可诊断的错误码，而非未处理的 500。
  try {
    await inngest.send(buildCollectRequestedEvent(created, project.domain))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await markRunStatus(created.id, 'failed', {
      failureReason: `采集事件派发失败：${reason}`,
      finishedAt: new Date().toISOString(),
    })
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 503 })
  }

  return NextResponse.json(created, { status: 201 })
}
