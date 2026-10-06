import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { projectSettings, projects } from '@/db/schema'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'
import { getProjectByDomain, getProjectSettings, getTargetKeywords, setTargetKeywords } from '@/lib/repositories'
import { parseProjectTargeting, type ProjectTargeting } from '@/lib/projects/input'
import { isMarketCode } from '@/lib/markets'

type ProjectRow = typeof projects.$inferSelect
type Targeting = Extract<ProjectTargeting, { ok: true }>

// 空白向导填了已存在的域名（第一波审查 I3）：写入用户本次明确填写的值——品类、竞品、目标词（均为非空时）；
// 市场只补缺失或旧值，不让表单按域名猜的默认值覆盖已存的合规市场。空值不清空已存数据：空白表单没展示过它们。
async function reuseExisting(existing: ProjectRow, targeting: Targeting, competitors: string[]) {
  const patch: Partial<Pick<ProjectRow, 'industry' | 'market' | 'competitors'>> = {}
  if (targeting.industry) patch.industry = targeting.industry
  if (targeting.market && !isMarketCode(existing.market)) patch.market = targeting.market
  if (competitors.length > 0) patch.competitors = competitors
  const project = Object.keys(patch).length > 0
    ? (await db.update(projects).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(projects.id, existing.id)).returning())[0] ?? existing
    : existing
  if (targeting.targetKeywords?.length) await setTargetKeywords(existing.id, targeting.targetKeywords)
  const settings = await getProjectSettings(existing.id)
  return NextResponse.json({ ...project, settings, targetKeywords: await getTargetKeywords(existing.id), reused: true })
}

// POST /projects — 新建项目（§7）。domain 必填并在写入边界规范化，其余可选。
// id 由服务端生成（seed 用语义 id，运行期新建用带前缀的 uuid），与真实版形状一致。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    domain?: string
    industry?: string
    market?: string
    language?: string
    gscConnected?: boolean
    defaultModels?: string[]
    competitors?: string | string[]
    targetKeywords?: unknown
  }
  const raw = body.domain?.trim()
  if (!raw) return NextResponse.json({ error: 'domain_required' }, { status: 422 })
  const domain = normalizeDomain(raw)
  if (!domain) return NextResponse.json({ error: 'invalid_domain' }, { status: 422 })
  // SP-A §3.2/§3.3：品类须为英文描述、市场须为市场表 code、目标关键词 ≤20 个英文词。
  const targeting = parseProjectTargeting(body)
  if (!targeting.ok) return NextResponse.json({ error: targeting.error }, { status: 422 })

  // 竞品清单：表单传逗号分隔字符串，API 调用也可直接传数组；统一 trim 去空。
  const competitors = (
    Array.isArray(body.competitors) ? body.competitors : (body.competitors ?? '').split(',')
  )
    .map((c) => c.trim())
    .filter(Boolean)

  // 同域名复用项目：GSC property、运行和证据均应汇聚在一个项目内，不能再次建空壳。
  // 新建向导还要立即恢复这份项目配置，不能把已连接的 GSC 误显示成未连接。
  const existing = await getProjectByDomain(domain)
  if (existing) return reuseExisting(existing, targeting, competitors)

  const [created] = await db
    .insert(projects)
    .values({
      id: `proj_${crypto.randomUUID()}`,
      domain,
      industry: targeting.industry ?? '',
      market: targeting.market ?? '',
      // 只做英文市场（SP-A §1）：语言恒为 en，忽略入参。
      language: 'en',
      competitors,
    })
    .onConflictDoNothing({ target: [projects.ownerId, projects.domain] })
    .returning()

  // 并发提交时由唯一索引兜底；复用刚被另一请求创建的项目，保持新建向导可继续。
  if (!created) {
    const concurrent = await getProjectByDomain(domain)
    if (concurrent) return reuseExisting(concurrent, targeting, competitors)
    return NextResponse.json({ error: 'create_failed' }, { status: 503 })
  }

  await db.insert(projectSettings).values({
    projectId: created.id,
    gscConnected: Boolean(body.gscConnected),
    defaultModels: Array.isArray(body.defaultModels) ? body.defaultModels : [],
  })
  if (targeting.targetKeywords) await setTargetKeywords(created.id, targeting.targetKeywords)

  return NextResponse.json(created, { status: 201 })
}
