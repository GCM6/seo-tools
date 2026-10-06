import { NextResponse } from 'next/server'
import { releaseKnowledge } from '@/lib/knowledge/repository'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { notes?: string }
  try {
    return NextResponse.json(await releaseKnowledge(body.notes?.trim() ?? ''), { status: 201 })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'knowledge_release_failed'
    return NextResponse.json({ error: code }, { status: code === 'no_approved_knowledge_to_release' ? 409 : 500 })
  }
}

