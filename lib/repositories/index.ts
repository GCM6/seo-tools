import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { runs, findings, recommendations, evidenceArtifacts, projects, brandFacts } from '@/db/schema'

export const getRun = (id: string) => db.query.runs.findFirst({ where: eq(runs.id, id) })
export const getProject = (id: string) => db.query.projects.findFirst({ where: eq(projects.id, id) })
export const getFindings = (runId: string) => db.select().from(findings).where(eq(findings.runId, runId))
export const getRecommendations = (runId: string) => db.select().from(recommendations).where(eq(recommendations.runId, runId))
export const getEvidence = (id: string) => db.query.evidenceArtifacts.findFirst({ where: eq(evidenceArtifacts.id, id) })
export const getBrandFacts = (projectId: string) => db.select().from(brandFacts).where(eq(brandFacts.projectId, projectId))
export * from './validators'
