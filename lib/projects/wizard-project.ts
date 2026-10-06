import type { projects } from '@/db/schema'

// /new?projectId= 传给向导的项目快照（第一波审查 C1）：目标词必须随项目一起回填——
// 向导每次都会提交 targetKeywords，漏传等于用户一点「下一步」就把已存目标词清空。
export interface WizardProject {
  id: string
  domain: string
  industry: string
  market: string
  language: string
  competitors: string[]
  targetKeywords: string[]
}

export function wizardProjectProps(
  project: typeof projects.$inferSelect | null | undefined,
  settings: { targetKeywords?: string[] | null } | null | undefined,
): WizardProject | null {
  if (!project) return null
  return {
    id: project.id,
    domain: project.domain,
    industry: project.industry ?? '',
    market: project.market ?? '',
    language: project.language ?? '',
    competitors: project.competitors ?? [],
    targetKeywords: settings?.targetKeywords ?? [],
  }
}
