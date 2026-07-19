import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { projectSettings, projects } from '@/db/schema'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'
import { getProjectByDomain, getProjectSettings } from '@/lib/repositories'

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
  }
  const raw = body.domain?.trim()
  if (!raw) return NextResponse.json({ error: 'domain_required' }, { status: 422 })
  const domain = normalizeDomain(raw)
  if (!domain) return NextResponse.json({ error: 'invalid_domain' }, { status: 422 })

  // 同域名复用项目：GSC property、运行和证据均应汇聚在一个项目内，不能再次建空壳。
  // 新建向导还要立即恢复这份项目配置，不能把已连接的 GSC 误显示成未连接。
  const existing = await getProjectByDomain(domain)
  if (existing) {
    const settings = await getProjectSettings(existing.id)
    return NextResponse.json({ ...existing, settings, reused: true })
  }

  // 竞品清单：表单传逗号分隔字符串，API 调用也可直接传数组；统一 trim 去空。
  const competitors = (
    Array.isArray(body.competitors) ? body.competitors : (body.competitors ?? '').split(',')
  )
    .map((c) => c.trim())
    .filter(Boolean)

  const [created] = await db
    .insert(projects)
    .values({
      id: `proj_${crypto.randomUUID()}`,
      domain,
      industry: body.industry ?? '',
      market: body.market ?? '',
      language: body.language ?? '',
      competitors,
    })
    .onConflictDoNothing({ target: [projects.ownerId, projects.domain] })
    .returning()

  // 并发提交时由唯一索引兜底；复用刚被另一请求创建的项目，保持新建向导可继续。
  if (!created) {
    const concurrent = await getProjectByDomain(domain)
    if (concurrent) {
      const settings = await getProjectSettings(concurrent.id)
      return NextResponse.json({ ...concurrent, settings, reused: true })
    }
    return NextResponse.json({ error: 'create_failed' }, { status: 503 })
  }

  await db.insert(projectSettings).values({
    projectId: created.id,
    gscConnected: Boolean(body.gscConnected),
    defaultModels: Array.isArray(body.defaultModels) ? body.defaultModels : [],
    marketLocation: body.market ?? '',
  })

  return NextResponse.json(created, { status: 201 })
}
