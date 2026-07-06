import { eq, asc, and, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { runs, findings, recommendations, generatedPrompts, evidenceArtifacts, projects, projectSettings, brandFacts, retestSnapshots, prompts, aiProbeResults, sitePages, urlTemplates, keywords, keywordMetrics, competitors, keywordGaps, referenceArtifacts } from '@/db/schema'
import type { EvidenceType, EvidenceLevel, RunStatus } from '@/lib/types'
import type { LightCheckExtra } from '@/lib/crawl/light-check'

export const getRun = (id: string) => db.query.runs.findFirst({ where: eq(runs.id, id) })
export const getProject = (id: string) => db.query.projects.findFirst({ where: eq(projects.id, id) })
export const getFindings = (runId: string) => db.select().from(findings).where(eq(findings.runId, runId))
export const getFinding = (id: string) => db.query.findings.findFirst({ where: eq(findings.id, id) })
export const getRecommendations = (runId: string) => db.select().from(recommendations).where(eq(recommendations.runId, runId))
export const getEvidence = (id: string) => db.query.evidenceArtifacts.findFirst({ where: eq(evidenceArtifacts.id, id) })
export const getRunEvidence = (runId: string) => db.select().from(evidenceArtifacts).where(eq(evidenceArtifacts.runId, runId))
export const getBrandFacts = (projectId: string) => db.select().from(brandFacts).where(eq(brandFacts.projectId, projectId))
export const getBrandFact = (id: string) => db.query.brandFacts.findFirst({ where: eq(brandFacts.id, id) })

// —— 诊断生成链写入（spec §5：generateFindings → recommendations → prompts）——
// 规则引擎产物批量落库；空数组直接短路（drizzle .values([]) 会抛错）。
export const createFindings = (rows: (typeof findings.$inferInsert)[]) =>
  rows.length ? db.insert(findings).values(rows).returning() : Promise.resolve([])
export const createRecommendations = (rows: (typeof recommendations.$inferInsert)[]) =>
  rows.length ? db.insert(recommendations).values(rows).returning() : Promise.resolve([])
export const getRecommendation = (id: string) =>
  db.query.recommendations.findFirst({ where: eq(recommendations.id, id) })
export const createGeneratedPrompt = (row: typeof generatedPrompts.$inferInsert) =>
  db.insert(generatedPrompts).values(row).returning()
export const getGeneratedPromptsForRec = (recommendationId: string) =>
  db.select().from(generatedPrompts).where(eq(generatedPrompts.recommendationId, recommendationId))

// 忽略 finding（误报反馈，喂 §11.2 校准）/ 转为已生成建议
export const updateFindingStatus = (id: string, status: 'open' | 'dismissed' | 'converted') =>
  db.update(findings).set({ status }).where(eq(findings.id, id))

// —— brand_facts CRUD 与 verified 人工闸门（spec §5.1-1）——
export const createBrandFact = (row: typeof brandFacts.$inferInsert) =>
  db.insert(brandFacts).values(row).returning()
export const updateBrandFactStatus = (id: string, status: 'verified' | 'draft' | 'retired') =>
  db.update(brandFacts).set({ status, updatedAt: new Date().toISOString() }).where(eq(brandFacts.id, id))
export const deleteBrandFact = (id: string) => db.delete(brandFacts).where(eq(brandFacts.id, id))
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
  lightCheckExtra: LightCheckExtra | null
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
          lightCheckExtra: row.lightCheckExtra,
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

// —— P3 关键词 / P4 竞品 / gap（spec §6；Phase B/C）——
export const upsertKeyword = (row: typeof keywords.$inferInsert) =>
  db.insert(keywords).values(row).onConflictDoUpdate({
    target: [keywords.projectId, keywords.text, keywords.market],
    set: { intent: row.intent ?? '', searchVolume: row.searchVolume ?? null, difficulty: row.difficulty ?? null, cpc: row.cpc ?? null },
  }).returning()
export const getKeywords = (projectId: string) =>
  db.select().from(keywords).where(eq(keywords.projectId, projectId))
export const createKeywordMetrics = (rows: (typeof keywordMetrics.$inferInsert)[]) =>
  rows.length ? db.insert(keywordMetrics).values(rows).returning() : Promise.resolve([])
export const getRunKeywordMetrics = (runId: string) =>
  db.select().from(keywordMetrics).where(eq(keywordMetrics.runId, runId))

export const upsertCompetitor = (row: typeof competitors.$inferInsert) =>
  db.insert(competitors).values(row).onConflictDoUpdate({
    target: [competitors.projectId, competitors.domain],
    set: { overlapScore: row.overlapScore ?? null, sharedKeywordsCount: row.sharedKeywordsCount ?? 0 },
  }).returning()
export const getCompetitors = (projectId: string) =>
  db.select().from(competitors).where(eq(competitors.projectId, projectId))
export const getConfirmedCompetitors = (projectId: string) =>
  db.select().from(competitors).where(and(eq(competitors.projectId, projectId), eq(competitors.status, 'confirmed')))
export const setCompetitorStatus = (id: string, status: 'candidate' | 'confirmed' | 'dismissed') =>
  db.update(competitors).set({ status }).where(eq(competitors.id, id))

export const createKeywordGaps = (rows: (typeof keywordGaps.$inferInsert)[]) =>
  rows.length ? db.insert(keywordGaps).values(rows).returning() : Promise.resolve([])
export const getRunKeywordGaps = (runId: string) =>
  db.select().from(keywordGaps).where(eq(keywordGaps.runId, runId))

// GSC OAuth 令牌存取（Phase B）
export const setGscConnection = (projectId: string, data: { gscConnected: boolean; gscRefreshToken?: string | null; gscSiteUrl?: string | null }) =>
  db.update(projectSettings).set(data).where(eq(projectSettings.projectId, projectId))

export const getSiteAuditEvidence = async (runId: string) => {
  const rows = await db.select().from(evidenceArtifacts)
    .where(and(eq(evidenceArtifacts.runId, runId), eq(evidenceArtifacts.type, 'site_audit')))
  return rows[0]
}

// —— Phase E：回测 / 建议闭环 / 规则保鲜 写入器 ——

// 项目下全部 run（回测到期横幅 / baseline 选择用）。
export const getProjectRuns = (projectId: string) =>
  db.select().from(runs).where(eq(runs.projectId, projectId)).orderBy(asc(runs.startedAt))

// 回测快照批量落库（generate-findings 收尾算 delta 后写；spec §5.1-3 / §6）。
export const createRetestSnapshots = (rows: (typeof retestSnapshots.$inferInsert)[]) =>
  rows.length ? db.insert(retestSnapshots).values(rows).returning() : Promise.resolve([])

// 建议 outcome 只能由回测 delta 计算写入（spec §9：不可手填 effective）。
export const setRecommendationOutcome = (
  id: string,
  outcome: 'unknown' | 'effective' | 'ineffective' | 'regressed',
  outcomeEvidenceId?: string | null,
) => db.update(recommendations).set({ outcome, outcomeEvidenceId: outcomeEvidenceId ?? null }).where(eq(recommendations.id, id))

// 用户标记「已执行」（spec §5.1-6）：记 applied_at + 说明。
export const markRecommendationApplied = (id: string, appliedNote: string) =>
  db.update(recommendations)
    .set({ appliedAt: new Date().toISOString(), appliedNote })
    .where(eq(recommendations.id, id))

// 项目回测排期（spec §5.1-6）：任一建议 applied 后 +28~42 天；重跑/手动 dismiss 后清空。
export const setProjectNextRetestDue = (projectId: string, dueAtIso: string | null) =>
  db.update(projects).set({ nextRetestDueAt: dueAtIso }).where(eq(projects.id, projectId))

// findings 忽略：置 dismissed + 记原因/时间（spec §6，喂 §11.2 误报校准）。
export const dismissFinding = (id: string, reason: string) =>
  db.update(findings)
    .set({ status: 'dismissed', dismissedAt: new Date().toISOString(), dismissReason: reason })
    .where(eq(findings.id, id))

// 规则保鲜资产（spec §11.1）：读取全部 + upsert（seed / 巡检写入）。
export const getReferenceArtifacts = () => db.select().from(referenceArtifacts)
export const upsertReferenceArtifact = (row: typeof referenceArtifacts.$inferInsert) =>
  db.insert(referenceArtifacts).values(row).onConflictDoUpdate({
    target: referenceArtifacts.artifactKey,
    set: { version: row.version ?? 'v1', sourceUrl: row.sourceUrl ?? '', lastVerifiedAt: row.lastVerifiedAt ?? null, refreshCadenceDays: row.refreshCadenceDays ?? 90, payload: row.payload ?? null },
  })

export * from './validators'
