'use server'

import { revalidatePath } from 'next/cache'
import { createBrandFact, updateBrandFactStatus, deleteBrandFact } from '@/lib/repositories'

// brand_facts 的人在环闸门（spec §5.1-1 / §6.2）：只有 status='verified' 的品牌事实
// 才能被注入执行提示词。新建默认 draft，需人工核验后才升为 verified。

type FactStatus = 'verified' | 'draft' | 'retired'

export interface AddBrandFactInput {
  projectId: string
  runId: string
  locale: string
  factType: string
  factText: string
  sourceUrl?: string
  sourceNote?: string
}

export async function addBrandFact(input: AddBrandFactInput) {
  const factText = input.factText?.trim()
  // 必填校验：空事实拒绝入库，不静默补默认值。
  if (!factText) return { ok: false as const, error: 'empty_fact_text' }

  await createBrandFact({
    id: `bf_${crypto.randomUUID()}`,
    projectId: input.projectId,
    factType: input.factType?.trim() || 'general',
    factText,
    sourceUrl: input.sourceUrl?.trim() || null,
    sourceNote: input.sourceNote?.trim() || null,
    status: 'draft',
  })
  revalidatePath(`/${input.locale}/runs/${input.runId}/facts`)
  return { ok: true as const }
}

// 人工闸门：draft ↔ verified ↔ retired。verified 是唯一可注入提示词的状态。
export async function setBrandFactStatus(id: string, status: FactStatus, runId: string, locale: string) {
  await updateBrandFactStatus(id, status)
  revalidatePath(`/${locale}/runs/${runId}/facts`)
}

export async function removeBrandFact(id: string, runId: string, locale: string) {
  await deleteBrandFact(id)
  revalidatePath(`/${locale}/runs/${runId}/facts`)
}
