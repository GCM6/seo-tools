import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { runs } from '@/db/schema'
import { getProject } from '@/lib/repositories'
import { inngest } from '@/lib/inngest/client'
import { buildCollectRequestedEvent } from '@/lib/inngest/events'

const VALID_RUN_TYPE = ['baseline', 'retest'] as const

// POST /runs — 新建一次诊断 run（§7）。projectId 必填且须存在。
// 建 run 即置 status=collecting 并向 Inngest 派发采集事件，由 collectEvidence 函数接管。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string
    runType?: string
  }
  const projectId = body.projectId?.trim()
  const runType = body.runType ?? 'baseline'

  if (!projectId) return NextResponse.json({ error: 'project_id_required' }, { status: 422 })
  if (!VALID_RUN_TYPE.includes(runType as (typeof VALID_RUN_TYPE)[number]))
    return NextResponse.json({ error: 'invalid_run_type' }, { status: 422 })

  const project = await getProject(projectId)
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [created] = await db
    .insert(runs)
    .values({ id: `run_${crypto.randomUUID()}`, projectId, runType, status: 'collecting' })
    .returning()

  await inngest.send(buildCollectRequestedEvent(created, project.domain))

  return NextResponse.json(created, { status: 201 })
}
