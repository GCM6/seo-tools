import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { analysisSessions, knowledgeEntryVersions, workflowArtifacts } from '@/db/schema'

// 轻量只读边界：报告组件可读取知识溯源，而不加载采集/蒸馏/provider 依赖。
export const getAnalysisSessionSnapshot = (id: string) => db.query.analysisSessions.findFirst({ where: eq(analysisSessions.id, id) })
export const getAnalysisSessionArtifacts = (sessionId: string) =>
  db.select().from(workflowArtifacts).where(eq(workflowArtifacts.sessionId, sessionId)).orderBy(asc(workflowArtifacts.createdAt))

export async function getKnowledgeSourceUrls(refs: string[]): Promise<string[]> {
  if (!refs.length) return []
  const versions = await db.select({ sourceUrls: knowledgeEntryVersions.sourceUrls })
    .from(knowledgeEntryVersions)
    .where(inArray(knowledgeEntryVersions.id, refs))
  return [...new Set(versions.flatMap((version) => version.sourceUrls))]
}
