import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { projectSettings, projects } from '@/db/schema'

// 规范化用户输入的站点地址：裸域名补 https://，并校验可解析为
// http(s) URL。domain 会被下游当作抓取入口 URL 喂给 assertPublicUrl(new URL(...))，
// 若在此不补 scheme，裸域名会让 new URL 抛错，使新建 run 一创建就 failed。
function normalizeDomain(raw: string): string | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
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
  }
  const raw = body.domain?.trim()
  if (!raw) return NextResponse.json({ error: 'domain_required' }, { status: 422 })
  const domain = normalizeDomain(raw)
  if (!domain) return NextResponse.json({ error: 'invalid_domain' }, { status: 422 })

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
    .returning()

  await db.insert(projectSettings).values({
    projectId: created.id,
    gscConnected: Boolean(body.gscConnected),
    defaultModels: Array.isArray(body.defaultModels) ? body.defaultModels : [],
    marketLocation: body.market ?? '',
  })

  return NextResponse.json(created, { status: 201 })
}
