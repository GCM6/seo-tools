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
