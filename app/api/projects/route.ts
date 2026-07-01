import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { projects } from '@/db/schema'

// POST /projects — 新建项目（§7）。本轮桩：domain 必填，其余可选。
// id 由服务端生成（seed 用语义 id，运行期新建用带前缀的 uuid），与真实版形状一致。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    domain?: string
    industry?: string
    market?: string
    language?: string
  }
  const domain = body.domain?.trim()
  if (!domain) return NextResponse.json({ error: 'domain_required' }, { status: 422 })

  const [created] = await db
    .insert(projects)
    .values({
      id: `proj_${crypto.randomUUID()}`,
      domain,
      industry: body.industry ?? '',
      market: body.market ?? '',
      language: body.language ?? '',
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
}
