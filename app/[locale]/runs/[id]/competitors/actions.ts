'use server'

import { revalidatePath } from 'next/cache'
import { setCompetitorStatus } from '@/lib/repositories'
import { inngest } from '@/lib/inngest/client'
import { buildCompetitorsConfirmedEvent } from '@/lib/inngest/events'

// 竞品人工闸门（spec §4 P4 / §5.1-4 两段式诊断）。确认后触发增量再评估：
// 只重算竞品依赖规则、按 fingerprint 并入当前 run，不重跑采集、不改 run 状态。
export async function confirmCompetitorAction(competitorId: string, projectId: string, runId: string, locale: string) {
  await setCompetitorStatus(competitorId, 'confirmed')
  await inngest.send(buildCompetitorsConfirmedEvent({ runId, projectId }))
  revalidatePath(`/${locale}/runs/${runId}/competitors`)
}

export async function dismissCompetitorAction(competitorId: string, runId: string, locale: string) {
  await setCompetitorStatus(competitorId, 'dismissed')
  revalidatePath(`/${locale}/runs/${runId}/competitors`)
}

// 恢复为候选（撤销确认/驳回）；恢复不自动重评，下次确认或回测时重算。
export async function restoreCompetitorAction(competitorId: string, runId: string, locale: string) {
  await setCompetitorStatus(competitorId, 'candidate')
  revalidatePath(`/${locale}/runs/${runId}/competitors`)
}
