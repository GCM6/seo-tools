import type { ClaimType, EvidenceLevel, RecommendationStatus, BrandFactStatus } from '@/lib/types'

export function assertCanGeneratePrompt(status: RecommendationStatus): void {
  if (status !== 'accepted' && status !== 'edited')
    throw new Error(`recommendation status "${status}" cannot generate prompt (need accepted|edited)`)
}

export function assertFindingClaimEvidence(
  { claimType, evidenceLevels }: { claimType: ClaimType; evidenceLevels: EvidenceLevel[] },
): void {
  if (claimType === 'measured_hard' && !evidenceLevels.includes('L4'))
    throw new Error('measured_hard finding requires at least one L4 evidence')
  if (claimType === 'measured_sample' && !evidenceLevels.some((l) => l === 'L3' || l === 'L4'))
    throw new Error('measured_sample finding requires a sampled (L3/L4) evidence')
}

export function assertInputFactsVerified(facts: { status: BrandFactStatus }[]): void {
  if (!facts.every((f) => f.status === 'verified'))
    throw new Error('generated_prompts.input_fact_refs must reference verified brand_facts only')
}

// 品类（projects.industry 的语义，SP-A §3.2）：英文品类描述，会被拼进英文 AI 探针与 AIO 查询。
// 字符集只允许英文字母/数字/空格与 & / , . ' ( ) + -，天然拒绝中文与旧下拉默认值（含「·」「…」）。
const CATEGORY_CHARS = /^[A-Za-z0-9][A-Za-z0-9 &/,.'()+-]*$/

export function isValidCategory(text: string): boolean {
  const t = text.trim()
  return t.length >= 3 && t.length <= 80 && CATEGORY_CHARS.test(t)
}

export function assertValidCategory(text: string): void {
  if (!isValidCategory(text))
    throw new Error("category must be 3-80 English chars (letters, digits, space, & / , . ' ( ) + -)")
}

// 目标关键词（向导可选输入）：同一字符集，长度 2–80。
export function isValidKeyword(text: string): boolean {
  const t = text.trim()
  return t.length >= 2 && t.length <= 80 && CATEGORY_CHARS.test(t)
}
