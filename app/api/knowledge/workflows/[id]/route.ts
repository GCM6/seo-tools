import { NextResponse } from 'next/server'
import { reviewWorkflowProposal } from '@/lib/knowledge/repository'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { action?: 'approve' | 'reject'; reason?: string }
  if (!body.action || !['approve', 'reject'].includes(body.action)) return NextResponse.json({ error: 'action_invalid' }, { status: 422 })
  if (body.action === 'reject' && !body.reason?.trim()) return NextResponse.json({ error: 'reason_required' }, { status: 422 })
  try {
    await reviewWorkflowProposal(id, body.action, body.reason?.trim())
    return NextResponse.json({ ok: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'workflow_review_failed'
    return NextResponse.json({ error: code }, { status: code === 'workflow_proposal_not_reviewable' ? 409 : 500 })
  }
}

