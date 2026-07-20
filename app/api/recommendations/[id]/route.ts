import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { recommendations } from '@/db/schema'
import { getRun, markRecommendationApplied, markRunStatus, setProjectNextRetestDue } from '@/lib/repositories'

const VALID_STATUS = ['draft', 'accepted', 'edited', 'rejected'] as const

// 标记「已执行」后为项目排的回测窗口（spec §5.1-6：applied 后 +28 天同协议重跑）。
const RETEST_WINDOW_DAYS = 28

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    status?: string
    editedPayload?: unknown
    applied?: boolean
    appliedNote?: string
  }

  // 「标记已执行」分支（spec §5.1-6）——人工闸门（accepted/edited）之后才允许标已执行；
  // 记 applied_at + 说明，并给该建议所属项目排回测期（rec → run → projectId）。
  if (body.applied === true) {
    const rec = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
    if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (rec.status !== 'accepted' && rec.status !== 'edited')
      return NextResponse.json({ error: 'not_gated' }, { status: 422 })

    await markRecommendationApplied(id, body.appliedNote ?? '')
    const run = await getRun(rec.runId)
    if (run) {
      const dueAt = new Date(Date.now() + RETEST_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
      await setProjectNextRetestDue(run.projectId, dueAt)
    }

    const applied = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
    return NextResponse.json(applied)
  }

  // 撤销「已执行」（A3 补充）——清空 appliedAt/appliedNote，恢复到可重新标记的状态。
  // 注意：不回滚 nextRetestDueAt。回滚需要重算「该项目全部建议中最新一次 applied 的时间」
  // 才能得到正确的新到期日，这超出本次改动范围；因此撤销后复测到期日期保持不变——
  // 这一点在 output 页复测计划卡的口径说明里同样向用户说明，不是静默行为。
  if (body.applied === false) {
    const rec = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
    if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    await db
      .update(recommendations)
      .set({ appliedAt: null, appliedNote: null })
      .where(eq(recommendations.id, id))

    const reverted = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
    return NextResponse.json(reverted)
  }

  const status = body.status

  if (!status || !VALID_STATUS.includes(status as (typeof VALID_STATUS)[number]))
    return NextResponse.json({ error: 'invalid_status' }, { status: 422 })

  const rec = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
  if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [updated] = await db
    .update(recommendations)
    .set({
      status,
      editedPayload: status === 'edited' ? body.editedPayload ?? rec.editedPayload : null,
    })
    .where(eq(recommendations.id, id))
    .returning()

  // 第 4 步只有在全部建议均已人工处理后才开放：任一建议回到草稿，即回到确认阶段。
  // 这样 Stepper 的输出态来自真实状态机，而不是用户手动点进某个 URL。
  const run = await getRun(rec.runId)
  if (run && (run.status === 'reviewing' || run.status === 'output')) {
    const allRecommendations = await db.query.recommendations.findMany({
      where: eq(recommendations.runId, rec.runId),
    })
    const allDecided = allRecommendations.length > 0 && allRecommendations.every((item) => item.status !== 'draft')
    const nextRunStatus = allDecided ? 'output' : 'reviewing'

    if (run.status !== nextRunStatus) {
      await markRunStatus(run.id, nextRunStatus, {
        finishedAt: run.finishedAt ?? undefined,
        failureReason: run.failureReason,
      })
    }
  }

  return NextResponse.json(updated)
}
