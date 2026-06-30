import type { ClaimType, EvidenceLevel } from './types'

type Variant = 'm' | 'i' | 'g' | 'ok'

export function provenanceForClaim(claim: ClaimType): { variant: Variant; labelKey: string } {
  switch (claim) {
    case 'measured_hard':
    case 'measured_sample': return { variant: 'm', labelKey: 'common.tag.measured' }
    case 'inferred': return { variant: 'i', labelKey: 'common.tag.inferred' }
    case 'hypothesis': return { variant: 'i', labelKey: 'common.tag.suspected' }
  }
}

export function labelKeyForLevel(level: EvidenceLevel): string {
  if (level === 'L4' || level === 'L3') return 'common.tag.measured'
  if (level === 'L2') return 'common.tag.inferred'
  return 'common.tag.suspected'
}
