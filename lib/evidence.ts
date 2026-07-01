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

// 证据等级 → 出处标签的 variant + labelKey，单一来源（对齐 provenanceForClaim）。
// StatStrip 等直接用它，避免各处各写一遍「L4/L3→实测」的 cutoff。
export function provenanceForLevel(level: EvidenceLevel): { variant: Variant; labelKey: string } {
  const variant: Variant = level === 'L4' || level === 'L3' ? 'm' : 'i'
  return { variant, labelKey: labelKeyForLevel(level) }
}
