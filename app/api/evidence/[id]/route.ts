import { NextResponse } from 'next/server'
import { getEvidence } from '@/lib/repositories'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const artifact = await getEvidence(id)
  if (!artifact) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(artifact)
}
