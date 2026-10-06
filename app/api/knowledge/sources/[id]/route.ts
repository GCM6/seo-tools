import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { knowledgeSources } from '@/db/schema'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const source = await db.query.knowledgeSources.findFirst({ where: eq(knowledgeSources.id, id) })
  if (!source) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const body = await req.json().catch(() => ({})) as { enabled?: boolean; name?: string; config?: Record<string, unknown> }
  const [updated] = await db.update(knowledgeSources).set({
    enabled: typeof body.enabled === 'boolean' ? body.enabled : source.enabled,
    name: body.name?.trim() || source.name,
    config: body.config ? { ...source.config, ...body.config } : source.config,
    updatedAt: new Date().toISOString(),
  }).where(eq(knowledgeSources.id, id)).returning()
  return NextResponse.json(updated)
}
