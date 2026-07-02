'use server'

import { revalidatePath } from 'next/cache'
import { setSitePageKeyFlag, setTemplateRepresentative } from '@/lib/repositories'

// 面板上的两个人工操作。都只改 project 级状态，不回写历史 run 的证据（证据不可变）。
export async function toggleKeyPageAction(pageId: string, isKeyPage: boolean, runId: string, locale: string) {
  await setSitePageKeyFlag(pageId, isKeyPage)
  revalidatePath(`/${locale}/runs/${runId}/site`)
}

export async function setRepresentativeAction(templateId: string, pageId: string, runId: string, locale: string) {
  await setTemplateRepresentative(templateId, pageId)
  revalidatePath(`/${locale}/runs/${runId}/site`)
}
