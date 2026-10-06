import { NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest/client'
import { listKnowledgeSources, seedKnowledgeSources } from '@/lib/knowledge/repository'

const PROVIDERS = new Set(['openai', 'gemini', 'deepseek'])

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { sourceId?: string; backfill?: boolean; provider?: string }
  if (!body.sourceId?.trim()) return NextResponse.json({ error: 'source_id_required' }, { status: 422 })
  if (body.provider && !PROVIDERS.has(body.provider)) return NextResponse.json({ error: 'provider_invalid' }, { status: 422 })
  await seedKnowledgeSources()
  const sourceId = body.sourceId.trim()
  const events = sourceId === 'all'
    ? (await listKnowledgeSources()).filter((source) => source.enabled && source.sourceType !== 'legacy_seed').map((source) => ({
      name: 'veris/knowledge.ingest.requested' as const,
      data: { sourceId: source.id, backfill: Boolean(body.backfill), provider: body.provider },
    }))
    : [{ name: 'veris/knowledge.ingest.requested' as const, data: { sourceId, backfill: Boolean(body.backfill), provider: body.provider } }]
  const ids = await inngest.send(events)
  return NextResponse.json({ accepted: true, dispatched: events.length, ids }, { status: 202 })
}
