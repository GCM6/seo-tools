import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { runs } from '@/db/schema'
import { getRun } from '@/lib/repositories'

// POST /runs/{id}/retest（§7）—— 以某 baseline run 为锚发起同协议回测。
// 铁律：回测必须复用同一 prompt set / 市场语言 / 模型族 / 采样规则（同协议）。
// 桩只落 retest run 壳（runType=retest，继承 baseline 的 project 与 protocol_version）；
// 真实版会克隆 baseline 的 prompts 并触发 Inngest 采集。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const baseline = await getRun(id)
  if (!baseline) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [retest] = await db
    .insert(runs)
    .values({
      id: `run_${crypto.randomUUID()}`,
      projectId: baseline.projectId,
      runType: 'retest',
      status: 'draft',
      protocolVersion: baseline.protocolVersion,
    })
    .returning()

  return NextResponse.json({ baselineRunId: id, retest }, { status: 201 })
}
