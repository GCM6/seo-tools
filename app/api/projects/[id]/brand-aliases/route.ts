import { NextResponse } from 'next/server'
import { getProject, setBrandAliases } from '@/lib/repositories'

// 品牌别名保存（D7：spec 2026-07-13-geo-branded-unbranded-redesign.md）。
// 品牌在回答中的别称（中文名/简称/旧名），用于探针 mentions 判定，不走 verified 闸门。
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { aliases?: unknown }
  if (!Array.isArray(body.aliases)) return NextResponse.json({ error: 'aliases_required' }, { status: 422 })

  const aliases = [...new Set(body.aliases.filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean))]

  await setBrandAliases(id, aliases)
  return NextResponse.json({ ok: true, aliases })
}
