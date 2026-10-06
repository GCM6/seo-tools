import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { knowledgeSources } from '@/db/schema'
import { sha256 } from '@/lib/knowledge/hash'

const TYPES = new Set(['reddit_community', 'reddit_search', 'google_docs', 'google_news'])

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as {
    sourceType?: string; name?: string; canonicalUrl?: string; language?: string; authorityLevel?: string; config?: Record<string, unknown>
  }
  if (!body.sourceType || !TYPES.has(body.sourceType)) return NextResponse.json({ error: 'source_type_invalid' }, { status: 422 })
  if (!body.name?.trim() || !body.canonicalUrl?.trim()) return NextResponse.json({ error: 'source_name_and_url_required' }, { status: 422 })
  let canonicalUrl: string
  try { canonicalUrl = new URL(body.canonicalUrl).toString() } catch { return NextResponse.json({ error: 'source_url_invalid' }, { status: 422 }) }
  const authorityLevel = body.sourceType.startsWith('google') ? 'official' : 'community'
  const [source] = await db.insert(knowledgeSources).values({
    id: `ks_custom_${sha256(canonicalUrl).slice(0, 24)}`,
    sourceType: body.sourceType,
    name: body.name.trim(),
    canonicalUrl,
    language: body.language?.trim() || 'en',
    authorityLevel,
    config: body.config ?? {},
  }).onConflictDoUpdate({
    target: knowledgeSources.canonicalUrl,
    set: { name: body.name.trim(), config: body.config ?? {}, enabled: true, updatedAt: new Date().toISOString() },
  }).returning()
  return NextResponse.json(source, { status: 201 })
}
