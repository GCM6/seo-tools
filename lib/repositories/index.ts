import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { runs, findings, recommendations, evidenceArtifacts, projects, brandFacts, retestSnapshots } from '@/db/schema'
import type { EvidenceType, EvidenceLevel, RunStatus } from '@/lib/types'

export const getRun = (id: string) => db.query.runs.findFirst({ where: eq(runs.id, id) })
export const getProject = (id: string) => db.query.projects.findFirst({ where: eq(projects.id, id) })
export const getFindings = (runId: string) => db.select().from(findings).where(eq(findings.runId, runId))
export const getFinding = (id: string) => db.query.findings.findFirst({ where: eq(findings.id, id) })
export const getRecommendations = (runId: string) => db.select().from(recommendations).where(eq(recommendations.runId, runId))
export const getEvidence = (id: string) => db.query.evidenceArtifacts.findFirst({ where: eq(evidenceArtifacts.id, id) })
export const getRunEvidence = (runId: string) => db.select().from(evidenceArtifacts).where(eq(evidenceArtifacts.runId, runId))
export const getBrandFacts = (projectId: string) => db.select().from(brandFacts).where(eq(brandFacts.projectId, projectId))
// retest_snapshots 以 baseline run 为锚点：屏4 之后回测同协议时按此拉 delta。
export const getRetestSnapshots = (baselineRunId: string) =>
  db.select().from(retestSnapshots).where(eq(retestSnapshots.baselineRunId, baselineRunId))
export interface NewEvidenceArtifact {
  id: string
  projectId: string
  runId: string
  type: EvidenceType
  claimLevel: EvidenceLevel
  source: string
  payload: unknown
  rawText: string
  rawHash: string
}

export const createEvidenceArtifact = (input: NewEvidenceArtifact) =>
  db.insert(evidenceArtifacts).values(input).returning()

export const markRunStatus = (runId: string, status: RunStatus, extra?: { finishedAt?: string }) =>
  db.update(runs).set({ status, ...extra }).where(eq(runs.id, runId))

export * from './validators'
