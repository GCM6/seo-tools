import { NextResponse } from 'next/server'
import { getRecommendations, getRun } from '@/lib/repositories'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const items = await getRecommendations(id)
  return NextResponse.json(items)
}
