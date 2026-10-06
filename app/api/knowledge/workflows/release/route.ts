import { NextResponse } from 'next/server'
import { releaseWorkflow } from '@/lib/knowledge/repository'

export async function POST() {
  try {
    return NextResponse.json(await releaseWorkflow(), { status: 201 })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'workflow_release_failed'
    return NextResponse.json({ error: code }, { status: code === 'no_approved_workflow_proposals' ? 409 : 500 })
  }
}

