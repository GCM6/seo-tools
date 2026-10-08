import type { ClaimType, EvidenceLevel } from './types'

// 证据等级 → 徽章形状（design-system §3.1，单一来源）。
// 只用形状区分，不占颜色：实测(L4)=实心 ink · 抽样实测(L3)=实心 ink-2 · 推断(L2)=空心 · 疑似(L1)=虚线。
// 「实测」字样只授予 L3/L4（项目铁律，见 CLAUDE.md / plan-ux §5.1）。
export type EvidenceGrade = 'hard' | 'sample' | 'inferred' | 'hypothesis'

const LABEL_KEY: Record<EvidenceGrade, string> = {
  hard: 'common.tag.measured',
  sample: 'common.tag.sampled',
  inferred: 'common.tag.inferred',
  hypothesis: 'common.tag.suspected',
}

const CLAIM_GRADE: Record<ClaimType, EvidenceGrade> = {
  measured_hard: 'hard',
  measured_sample: 'sample',
  inferred: 'inferred',
  hypothesis: 'hypothesis',
}

export function gradeForClaim(claim: ClaimType): EvidenceGrade {
  return CLAIM_GRADE[claim]
}

export function gradeForLevel(level: EvidenceLevel): EvidenceGrade {
  if (level === 'L4') return 'hard'
  if (level === 'L3') return 'sample'
  if (level === 'L2') return 'inferred'
  return 'hypothesis'
}

export function labelKeyForGrade(grade: EvidenceGrade): string {
  return LABEL_KEY[grade]
}

export function labelKeyForLevel(level: EvidenceLevel): string {
  return LABEL_KEY[gradeForLevel(level)]
}

// 证据等级 → 徽章等级 + 文案 key。StatStrip / FindingList 等直接用它，
// 避免各处各写一遍「L4/L3→实测」的 cutoff。
export function provenanceForClaim(claim: ClaimType): { grade: EvidenceGrade; labelKey: string } {
  const grade = gradeForClaim(claim)
  return { grade, labelKey: LABEL_KEY[grade] }
}

export function provenanceForLevel(level: EvidenceLevel): { grade: EvidenceGrade; labelKey: string } {
  const grade = gradeForLevel(level)
  return { grade, labelKey: LABEL_KEY[grade] }
}
