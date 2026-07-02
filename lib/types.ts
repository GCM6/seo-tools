export const CLAIM_TYPES = ['hypothesis', 'inferred', 'measured_sample', 'measured_hard'] as const
export type ClaimType = (typeof CLAIM_TYPES)[number]

export const EVIDENCE_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4'] as const
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number]

export const RECOMMENDATION_STATUSES = ['draft', 'accepted', 'edited', 'rejected'] as const
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number]

export type RunStatus = 'draft' | 'collecting' | 'collected' | 'diagnosing' | 'reviewing' | 'output' | 'failed'
export type FindingSide = 'seo' | 'geo' | 'technical'
export type EvidenceType = 'gsc' | 'ai_answer' | 'page_fetch' | 'render_check' | 'schema' | 'serp_snapshot' | 'manual' | 'sitemap' | 'site_audit'
export type BrandFactStatus = 'verified' | 'draft' | 'retired'

export const isMeasured = (c: ClaimType): boolean => c === 'measured_sample' || c === 'measured_hard'

// §6 实体（字段照 plan-ux.md §6.1；JSON 字段在 TS 侧是已解析对象/数组）
export interface EvidenceArtifact {
  id: string; projectId: string; runId: string; type: EvidenceType
  claimLevel: EvidenceLevel; source: string; capturedAt: string
  request: unknown; payload: unknown; rawText: string; rawHash: string; parserVersion: string
}
export interface Finding {
  id: string; runId: string; side: FindingSide; title: string; description: string
  severity: 'high' | 'mid' | 'ok'; claimType: ClaimType; confidence: string
  evidenceRefs: string[]; status: 'open' | 'dismissed' | 'converted'
}
export interface Recommendation {
  id: string; runId: string; findingId: string
  what: string; why: string; expectedImpact: string; effort: string; risk: string
  validationMethod: string; priority: string; confidence: string
  status: RecommendationStatus; editedPayload: unknown | null; evidenceRefs: string[]
}
export interface BrandFact {
  id: string; projectId: string; factType: string; factText: string
  sourceUrl: string | null; sourceNote: string | null; status: BrandFactStatus
}
export interface GeneratedPrompt {
  id: string; recommendationId: string; promptType: 'content' | 'technical' | 'brief' | 'cms'
  promptText: string; inputFactRefs: string[]; evidenceRefs: string[]
}
export interface Project { id: string; domain: string; industry: string; market: string; language: string; competitors: string[]; ownerId: string }
export interface Run {
  id: string
  projectId: string
  runType: 'baseline' | 'retest'
  status: RunStatus
  protocolVersion: string
  failureReason: string | null
}
export interface AiProbeResult {
  id: string; runId: string; promptId: string; evidenceId: string
  provider: string; modelId: string; runIdx: number
  brandPresent: boolean; targetDomainCited: boolean
  competitorsMentioned: string[]; citedUrls: string[]; sentiment: string
  rawAnswerHash: string; parserVersion: string
}
