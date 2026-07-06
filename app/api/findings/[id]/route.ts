import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { findings } from '@/db/schema'
import { dismissFinding } from '@/lib/repositories'

// findings.status 状态机（与 schema findings_status check 一致）。
const VALID_STATUS = ['open', 'dismissed', 'converted'] as const

// PATCH /findings/{id}（§7）—— 人工收纳/忽略/转建议。
// 注意：不放开 claim_type / evidence_refs 改写——护城河字段由采集与校验层锁死，接口不给编辑口子。
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { status?: string; dismissReason?: string }
  const status = body.status

  if (!status || !VALID_STATUS.includes(status as (typeof VALID_STATUS)[number]))
    return NextResponse.json({ error: 'invalid_status' }, { status: 422 })

  const finding = await db.query.findings.findFirst({ where: eq(findings.id, id) })
  if (!finding) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // 忽略必须带原因（喂 §11.2 误报校准）：落 dismissed + dismissed_at + dismiss_reason。
  if (status === 'dismissed') {
    const reason = typeof body.dismissReason === 'string' ? body.dismissReason.trim() : ''
    if (!reason) return NextResponse.json({ error: 'dismiss_reason_required' }, { status: 422 })
    await dismissFinding(id, reason)
    const updated = await db.query.findings.findFirst({ where: eq(findings.id, id) })
    return NextResponse.json(updated)
  }

  const [updated] = await db
    .update(findings)
    .set({ status })
    .where(eq(findings.id, id))
    .returning()

  return NextResponse.json(updated)
}
