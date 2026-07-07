import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { projects, projectSettings } from '@/db/schema'
import { getProject } from '@/lib/repositories'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'

// GET /projects/{id}（§7）。缺失 404。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(project)
}

// PATCH /projects/{id}（§7）—— 可改元数据（域名/行业/市场/语言/竞品）。向导「复用单项目
// upsert」据此更新已有项目（spec §SP-G2a-1）。domain 走 normalizeDomain，非法 422。
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    domain?: string
    industry?: string
    market?: string
    language?: string
    competitors?: string | string[]
    defaultModels?: string[]
  }

  const project = await getProject(id)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const patch: Partial<{
    domain: string
    industry: string
    market: string
    language: string
    competitors: string[]
  }> = {}
  if (body.domain !== undefined) {
    const domain = normalizeDomain(body.domain.trim())
    if (!domain) return NextResponse.json({ error: 'invalid_domain' }, { status: 422 })
    patch.domain = domain
  }
  if (body.industry !== undefined) patch.industry = body.industry
  if (body.market !== undefined) patch.market = body.market
  if (body.language !== undefined) patch.language = body.language
  if (body.competitors !== undefined) {
    patch.competitors = (Array.isArray(body.competitors) ? body.competitors : body.competitors.split(','))
      .map((c) => c.trim())
      .filter(Boolean)
  }

  const [updated] = await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(projects.id, id))
    .returning()

  // 引擎选择存 project_settings.defaultModels——run-probes 据此选 provider。向导第 2 步
  // 在项目已建后才定引擎，故用 PATCH 回填（spec §SP-G2a）。market 变更也同步 marketLocation。
  const settingsPatch: Partial<{ defaultModels: string[]; marketLocation: string }> = {}
  if (Array.isArray(body.defaultModels)) settingsPatch.defaultModels = body.defaultModels
  if (patch.market !== undefined) settingsPatch.marketLocation = patch.market
  if (Object.keys(settingsPatch).length > 0) {
    await db.update(projectSettings).set(settingsPatch).where(eq(projectSettings.projectId, id))
  }

  return NextResponse.json(updated)
}
