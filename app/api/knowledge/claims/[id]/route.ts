import { NextResponse } from 'next/server'
import { reviewClaim } from '@/lib/knowledge/repository'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as {
    action?: 'approve' | 'edit' | 'reject'
    reason?: string
    edited?: { statementZh?: string; statementEn?: string; titleZh?: string; titleEn?: string }
  }
  if (!body.action || !['approve', 'edit', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'action_invalid' }, { status: 422 })
  }
  if (body.action === 'reject' && !body.reason?.trim()) return NextResponse.json({ error: 'reason_required' }, { status: 422 })
  try {
    await reviewClaim({ claimId: id, action: body.action, reason: body.reason, edited: body.edited })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'review_failed'
    return NextResponse.json({ error: code }, { status: code === 'claim_not_reviewable' ? 409 : 500 })
  }
}

