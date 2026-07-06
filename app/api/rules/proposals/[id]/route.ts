import { NextResponse } from 'next/server'
import { setProposalStatus } from '@/lib/repositories'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { action?: string }
  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json({ error: 'action_invalid' }, { status: 422 })
  }
  const [updated] = await setProposalStatus(id, body.action === 'approve' ? 'approved' : 'rejected')
  if (!updated) return NextResponse.json({ error: 'proposal_not_found' }, { status: 404 })
  return NextResponse.json(updated)
}
