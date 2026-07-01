import { NextResponse } from 'next/server'
import { getRun, getFindings, getRecommendations } from '@/lib/repositories'

// GET /runs/{id}/report（§7）—— 屏4 报告的只读聚合：run 元信息 + findings + recommendations。
// 桩不做叙事渲染，只把三者的真实形状拼在一起，前端/真实版据此出报告与执行资产。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [findings, recommendations] = await Promise.all([getFindings(id), getRecommendations(id)])
  return NextResponse.json({ run, findings, recommendations })
}
