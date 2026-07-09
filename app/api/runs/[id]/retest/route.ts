import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { runs } from '@/db/schema'
import { getRun, getProject, markRunStatus, findActiveRun } from '@/lib/repositories'
import { inngest } from '@/lib/inngest/client'
import { buildCollectRequestedEvent } from '@/lib/inngest/events'
import { RULES_VERSION } from '@/lib/diagnosis/types'

// POST /runs/{id}/retest（§7）—— 以某 baseline run 为锚发起同协议回测。
// 铁律：回测必须复用同一 prompt set / 市场语言 / 模型族 / 采样规则（同协议），故新 run 继承
// baseline 的 project 与 protocol_version。派发 collect 事件时第三参穿入 baseline id，
// collect-evidence 会把它透传到 diagnose 事件，generateFindings 收尾据此算 finding 四态
// delta + 建议 outcome（spec §5.1-3）。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const baseline = await getRun(id)
  if (!baseline) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const project = await getProject(baseline.projectId)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // 同项目并发保护（spec §2.3）：已有进行中 run 时拒绝发起回测，不插入不派发。
  const active = await findActiveRun(baseline.projectId)
  if (active) return NextResponse.json({ error: 'run_in_progress', runId: active.id }, { status: 409 })

  // 与首轮（app/api/runs/route.ts）一致：直接以 project.domain 作为采集入口 url。
  const [retest] = await db
    .insert(runs)
    .values({
      id: `run_${crypto.randomUUID()}`,
      projectId: baseline.projectId,
      runType: 'retest',
      status: 'collecting',
      protocolVersion: baseline.protocolVersion,
      // 现场打当前版本，不从 baseline 复制——跨版本回测横幅据此触发（spec §11.3）。
      rulesVersion: RULES_VERSION,
      startedAt: new Date().toISOString(),
    })
    .returning()

  // 派发失败（如本地 Inngest dev server 未启动）时不能让 retest run 卡死在 collecting：
  // 标记 failed 并返回可诊断错误码，与首轮同构。
  try {
    await inngest.send(buildCollectRequestedEvent(retest, project.domain, baseline.id))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await markRunStatus(retest.id, 'failed', {
      failureReason: `采集事件派发失败：${reason}`,
      finishedAt: new Date().toISOString(),
    })
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 503 })
  }

  return NextResponse.json({ baselineRunId: id, retest }, { status: 201 })
}
