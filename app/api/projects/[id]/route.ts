import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { projects, projectSettings } from '@/db/schema'
import { getProject, getTargetKeywords, setTargetKeywords } from '@/lib/repositories'
import { parseProjectTargeting } from '@/lib/projects/input'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'

// GET /projects/{id}（§7）。缺失 404。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ...project, targetKeywords: await getTargetKeywords(id) })
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
    targetKeywords?: unknown
  }

  const project = await getProject(id)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  // SP-A §3.2/§3.3：品类须为英文描述、市场须为市场表 code、目标关键词 ≤20 个英文词。
  const targeting = parseProjectTargeting(body)
  if (!targeting.ok) return NextResponse.json({ error: targeting.error }, { status: 422 })

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
  if (targeting.industry !== undefined) patch.industry = targeting.industry
  if (targeting.market !== undefined) patch.market = targeting.market
  // 只做英文市场（SP-A §1）：语言恒为 en，忽略入参（顺带把历史 zh 项目归一）。
  patch.language = 'en'
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
  // 在项目已建后才定引擎，故用 PATCH 回填（spec §SP-G2a）。marketLocation 已废弃不再写（SP-A §3.1，全仓无读取方）。
  if (Array.isArray(body.defaultModels)) {
    await db.update(projectSettings).set({ defaultModels: body.defaultModels }).where(eq(projectSettings.projectId, id))
  }
  // 向导回填了已存目标词（/new 页传入），这里提交的列表即用户最终意图：[] = 清空。只写设置，不碰 keywords 测量表。
  if (targeting.targetKeywords) await setTargetKeywords(id, targeting.targetKeywords)

  return NextResponse.json(updated)
}
