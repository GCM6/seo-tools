import { eq, asc, and, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { runs, findings, recommendations, evidenceArtifacts, projects, projectSettings, brandFacts, retestSnapshots, prompts, aiProbeResults, sitePages, urlTemplates } from '@/db/schema'
import type { EvidenceType, EvidenceLevel, RunStatus } from '@/lib/types'

export const getRun = (id: string) => db.query.runs.findFirst({ where: eq(runs.id, id) })
export const getProject = (id: string) => db.query.projects.findFirst({ where: eq(projects.id, id) })
export const getFindings = (runId: string) => db.select().from(findings).where(eq(findings.runId, runId))
export const getFinding = (id: string) => db.query.findings.findFirst({ where: eq(findings.id, id) })
export const getRecommendations = (runId: string) => db.select().from(recommendations).where(eq(recommendations.runId, runId))
export const getEvidence = (id: string) => db.query.evidenceArtifacts.findFirst({ where: eq(evidenceArtifacts.id, id) })
export const getRunEvidence = (runId: string) => db.select().from(evidenceArtifacts).where(eq(evidenceArtifacts.runId, runId))
export const getBrandFacts = (projectId: string) => db.select().from(brandFacts).where(eq(brandFacts.projectId, projectId))
export const getProjectSettings = (projectId: string) =>
  db.query.projectSettings.findFirst({ where: eq(projectSettings.projectId, projectId) })
// 探针链：prompt set 与逐条探针结果（聚合派生 AI 可见度 / 地图 / SoV）
export const createPrompts = (rows: (typeof prompts.$inferInsert)[]) => db.insert(prompts).values(rows)
export const createAiProbeResult = (row: typeof aiProbeResults.$inferInsert) => db.insert(aiProbeResults).values(row)
export const getRunPrompts = (runId: string) =>
  db.select().from(prompts).where(eq(prompts.runId, runId)).orderBy(asc(prompts.priority))
export const getRunProbeResults = (runId: string) =>
  db.select().from(aiProbeResults).where(eq(aiProbeResults.runId, runId))
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
  request?: unknown
  payload: unknown
  rawText: string
  rawHash: string
  sitePageId?: string | null
}

export const createEvidenceArtifact = (input: NewEvidenceArtifact) =>
  db.insert(evidenceArtifacts).values(input).returning()

export const markRunStatus = (
  runId: string,
  status: RunStatus,
  extra?: { finishedAt?: string; failureReason?: string | null },
) =>
  db.update(runs).set({ status, ...extra }).where(eq(runs.id, runId))

// —— 站点页面 / URL 模板（全站路由发现，spec: 2026-07-02-site-route-discovery）——
export interface SitePageUpsert {
  url: string
  discoveredVia: 'entry' | 'sitemap' | 'crawl' | 'both'
  depth: number | null
  httpStatus: number | null
  finalUrl: string | null
  title: string | null
  canonicalUrl: string | null
  metaRobots: string | null
  mainTextChars: number | null
  contentHash: string | null
  checkStatus: 'checked' | 'discovered_only' | 'blocked_by_robots' | 'error'
  errorReason: string | null
}

// 逐行 upsert：以 (projectId, url) 为键；只覆盖轻检字段，不碰 isKeyPage/templateId 等人工状态。
export const upsertSitePages = async (projectId: string, runId: string, rows: SitePageUpsert[]) => {
  const now = new Date().toISOString()
  for (const row of rows) {
    await db
      .insert(sitePages)
      .values({ id: `sp_${crypto.randomUUID()}`, projectId, firstSeenRunId: runId, ...row, lastCheckedAt: now })
      .onConflictDoUpdate({
        target: [sitePages.projectId, sitePages.url],
        set: {
          discoveredVia: row.discoveredVia,
          depth: row.depth,
          httpStatus: row.httpStatus,
          finalUrl: row.finalUrl,
          title: row.title,
          canonicalUrl: row.canonicalUrl,
          metaRobots: row.metaRobots,
          mainTextChars: row.mainTextChars,
          contentHash: row.contentHash,
          checkStatus: row.checkStatus,
          errorReason: row.errorReason,
          lastCheckedAt: now,
        },
      })
  }
}

export const getSitePages = (projectId: string) =>
  db.select().from(sitePages).where(eq(sitePages.projectId, projectId))

export const updateInboundCounts = async (projectId: string, counts: Record<string, number>) => {
  for (const [url, count] of Object.entries(counts)) {
    await db.update(sitePages).set({ inboundLinkCount: count })
      .where(and(eq(sitePages.projectId, projectId), eq(sitePages.url, url)))
  }
}

export interface TemplatePlanInput {
  pattern: string
  pageUrls: string[]
  representativeUrl: string | null
}

// 模板同步：pageCount 每次刷新；representativePageId 仅在 source='heuristic' 时被启发式结果覆盖。
export const syncUrlTemplates = async (projectId: string, plans: TemplatePlanInput[]) => {
  const now = new Date().toISOString()
  const pages = await getSitePages(projectId)
  const idByUrl = new Map(pages.map((p) => [p.url, p.id]))
  for (const plan of plans) {
    const repId = plan.representativeUrl ? idByUrl.get(plan.representativeUrl) ?? null : null
    await db
      .insert(urlTemplates)
      .values({
        id: `tpl_${crypto.randomUUID()}`,
        projectId,
        pattern: plan.pattern,
        pageCount: plan.pageUrls.length,
        representativePageId: repId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [urlTemplates.projectId, urlTemplates.pattern],
        set: {
          pageCount: plan.pageUrls.length,
          representativePageId: sql`case when ${urlTemplates.source} = 'heuristic' then ${repId} else ${urlTemplates.representativePageId} end`,
          updatedAt: now,
        },
      })
    const pageIds = plan.pageUrls.map((u) => idByUrl.get(u)).filter((v): v is string => Boolean(v))
    if (pageIds.length) {
      const tpl = await db.query.urlTemplates.findFirst({
        where: and(eq(urlTemplates.projectId, projectId), eq(urlTemplates.pattern, plan.pattern)),
      })
      if (tpl) await db.update(sitePages).set({ templateId: tpl.id }).where(inArray(sitePages.id, pageIds))
    }
  }
}

export const getProjectTemplates = (projectId: string) =>
  db.select().from(urlTemplates).where(eq(urlTemplates.projectId, projectId))

export const setSitePageKeyFlag = (id: string, isKeyPage: boolean) =>
  db.update(sitePages).set({ isKeyPage }).where(eq(sitePages.id, id))

export const setTemplateRepresentative = (templateId: string, pageId: string) =>
  db.update(urlTemplates)
    .set({ representativePageId: pageId, source: 'user', updatedAt: new Date().toISOString() })
    .where(eq(urlTemplates.id, templateId))

export const getSiteAuditEvidence = async (runId: string) => {
  const rows = await db.select().from(evidenceArtifacts)
    .where(and(eq(evidenceArtifacts.runId, runId), eq(evidenceArtifacts.type, 'site_audit')))
  return rows[0]
}

export * from './validators'
