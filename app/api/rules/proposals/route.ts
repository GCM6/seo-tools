import { NextResponse } from 'next/server'
import { getRuleChangeProposals, createRuleChangeProposal } from '@/lib/repositories'
import { hasValidEvidence } from '@/lib/diagnosis/rule-proposals'

const VALID_STATUS = ['pending', 'approved', 'rejected'] as const
const VALID_CHANGE = ['new_rule', 'modify_threshold', 'deprecate', 'update_artifact'] as const

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status')
  const filter = VALID_STATUS.includes(status as never) ? (status as (typeof VALID_STATUS)[number]) : undefined
  const rows = await getRuleChangeProposals(filter)
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    changeType?: string
    target?: string
    evidenceRefs?: string[]
    diff?: unknown
  }
  if (!VALID_CHANGE.includes(body.changeType as never)) {
    return NextResponse.json({ error: 'change_type_invalid' }, { status: 422 })
  }
  if (!body.target?.trim()) {
    return NextResponse.json({ error: 'target_required' }, { status: 422 })
  }
  if (!hasValidEvidence(body.evidenceRefs)) {
    return NextResponse.json({ error: 'evidence_required' }, { status: 422 })
  }
  const [created] = await createRuleChangeProposal({
    id: `rcp_${crypto.randomUUID()}`,
    source: 'manual',
    changeType: body.changeType as (typeof VALID_CHANGE)[number],
    target: body.target.trim(),
    evidenceRefs: body.evidenceRefs!.map((r) => r.trim()).filter(Boolean),
    diff: body.diff ?? null,
    status: 'pending',
  })
  return NextResponse.json(created, { status: 201 })
}
