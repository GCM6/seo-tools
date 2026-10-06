export type KnowledgeSourceType =
  | 'google_docs'
  | 'google_news'
  | 'reddit_community'
  | 'reddit_search'
  | 'legacy_seed'

export type ClaimType =
  | 'principle'
  | 'diagnostic_check'
  | 'decision_rule'
  | 'remediation'
  | 'blocker'
  | 'validation'
  | 'explanation'
  | 'hypothesis'

export interface SourceCandidate {
  externalId: string
  canonicalUrl: string
  documentType: 'article' | 'release_note' | 'post' | 'comment' | 'thread' | 'legacy_rule'
  title: string
  author?: string
  community?: string
  publishedAt?: string
  locale: string
  rawText: string
  rawPayload: unknown
  metadata?: Record<string, unknown>
  etag?: string
  lastModified?: string
}

export interface ClaimDraft {
  claimType: ClaimType
  topic: string
  statementZh: string
  statementEn: string
  exactQuote: string
  applicability: Record<string, unknown>
  confidence: 'observation' | 'hypothesis' | 'community_practice_candidate' | 'inferred' | 'measured' | 'official'
  consensusKey?: string
  officialConflict: boolean
}

export interface DistillationResult {
  claims: ClaimDraft[]
}

export interface CoverageReport {
  requested: number
  fetched: number
  changed: number
  skipped: number
  failed: number
  earliestObservedAt?: string
  inaccessibleReasons: string[]
}

