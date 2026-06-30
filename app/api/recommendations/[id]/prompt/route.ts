import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { recommendations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { assertCanGeneratePrompt } from '@/lib/repositories'
import type { RecommendationStatus } from '@/lib/types'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rec = await db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
  if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  try {
    // 人在环内：只有 accepted|edited 才能生成 prompt
    assertCanGeneratePrompt(rec.status as RecommendationStatus)
    // 本轮：input facts 取该项目 verified brand_facts；真实拼装留 SP5
    return NextResponse.json({ ok: true, recommendationId: id, promptType: 'content', promptText: '<stub>' })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
