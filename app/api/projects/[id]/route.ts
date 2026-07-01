import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { projects } from '@/db/schema'
import { getProject } from '@/lib/repositories'

// GET /projects/{id}（§7）。缺失 404。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(project)
}

// PATCH /projects/{id}（§7）—— 仅可改可编辑元数据（行业/市场/语言）。domain 不在本轮桩内改。
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    industry?: string
    market?: string
    language?: string
  }

  const project = await getProject(id)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const patch: Partial<{ industry: string; market: string; language: string }> = {}
  if (body.industry !== undefined) patch.industry = body.industry
  if (body.market !== undefined) patch.market = body.market
  if (body.language !== undefined) patch.language = body.language

  const [updated] = await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(projects.id, id))
    .returning()

  return NextResponse.json(updated)
}
