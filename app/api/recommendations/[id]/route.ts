import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { recommendations } from '@/db/schema'

const VALID_STATUS = ['draft', 'accepted', 'edited', 'rejected'] as const

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { status?: string }
  const status = body.status

  if (!status || !VALID_STATUS.includes(status as (typeof VALID_STATUS)[number]))
    return NextResponse.json({ error: 'invalid_status' }, { status: 422 })

  const rec = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
  if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [updated] = await db
    .update(recommendations)
    .set({ status })
    .where(eq(recommendations.id, id))
    .returning()

  return NextResponse.json(updated)
}
