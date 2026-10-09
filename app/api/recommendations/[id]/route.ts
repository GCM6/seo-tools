import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { analysisSessions, recommendations } from '@/db/schema'
import { getRun, markRecommendationApplied, markRunStatus } from '@/lib/repositories'
import { mirrorRecommendationApplied, mirrorRecommendationStatus } from '@/lib/issues/bridge'

const VALID_STATUS = ['draft', 'accepted', 'edited', 'rejected'] as const

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    status?: string
    editedPayload?: unknown
    applied?: boolean
    appliedNote?: string
  }

  // 「标记已执行」分支（spec §5.1-6）——人工闸门（accepted/edited）之后才允许标已执行；
  // 记 applied_at + 说明，并把执行同步到对应问题（旧界面桥接）。
  if (body.applied === true) {
    const rec = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
    if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (rec.status !== 'accepted' && rec.status !== 'edited')
      return NextResponse.json({ error: 'not_gated' }, { status: 422 })

    await markRecommendationApplied(id, body.appliedNote ?? '')
    // 复查提醒改由问题表重算（spec 2026-10-09 §5.4-2），不再每次 +28 天。
    await mirrorRecommendationApplied(id, true, body.appliedNote ?? '')

    const applied = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
    return NextResponse.json(applied)
  }

  // 撤销「已执行」（A3 补充）——清空 appliedAt/appliedNote，恢复到可重新标记的状态，并同步撤销问题上的执行。
  if (body.applied === false) {
    const rec = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
    if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    await db
      .update(recommendations)
      .set({ appliedAt: null, appliedNote: null })
      .where(eq(recommendations.id, id))
    await mirrorRecommendationApplied(id, false)

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
  await mirrorRecommendationStatus(id, status as 'draft' | 'accepted' | 'edited' | 'rejected')

  // 第 4 步只有在全部建议均已人工处理后才开放：任一建议回到草稿，即回到确认阶段。
  // 这样 Stepper 的输出态来自真实状态机，而不是用户手动点进某个 URL。
  const [run, allRecommendations] = await Promise.all([
    getRun(rec.runId),
    db.query.recommendations.findMany({ where: eq(recommendations.runId, rec.runId) }),
  ])
  if (run && (run.status === 'reviewing' || run.status === 'output')) {
    const allDecided = allRecommendations.length > 0 && allRecommendations.every((item) => item.status !== 'draft')
    const nextRunStatus = allDecided ? 'output' : 'reviewing'

    if (run.status !== nextRunStatus) {
      await markRunStatus(run.id, nextRunStatus, {
        finishedAt: run.finishedAt ?? undefined,
        failureReason: run.failureReason,
      })
    }
    if (run.analysisSessionId) {
      await db.update(analysisSessions).set({
        status: allDecided ? 'completed' : 'reviewing',
        updatedAt: new Date().toISOString(),
        finishedAt: allDecided ? new Date().toISOString() : null,
      }).where(eq(analysisSessions.id, run.analysisSessionId))
    }
  }

  return NextResponse.json(updated)
}
