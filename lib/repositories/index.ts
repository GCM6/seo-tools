import { eq, asc, desc, and, isNull, isNotNull, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { runs, findings, recommendations, generatedPrompts, evidenceArtifacts, projects, projectSettings, brandFacts, retestSnapshots, prompts, aiProbeResults, sitePages, urlTemplates, keywords, keywordMetrics, competitors, keywordGaps, referenceArtifacts, ruleChangeProposals, providerCredentials, reportShares } from '@/db/schema'
import { hasValidEvidence, computeArtifactUpdate, assertReleasableVersion } from '@/lib/diagnosis/rule-proposals'
import type { EvidenceType, EvidenceLevel, RunStatus, ClaimType } from '@/lib/types'
import type { LightCheckExtra } from '@/lib/crawl/light-check'
import { assertFindingClaimEvidence } from './validators'
import { pickLatestRun } from '@/lib/projects/summary'
import { encryptSecret } from '@/lib/crypto/secrets'
import { encryptGscToken } from '@/lib/gsc/token-crypto'
import { generateShareToken } from '@/lib/share/token'
import { isShareExpired } from '@/lib/share/expiry'

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
// §6.2 写路径闸门：measured_hard 必须有 L4、measured_sample 必须有 L3/L4 证据——
// finding 行只带 evidence_refs（artifact id），故先按 refs 反查 claim_level 再逐行 assert。
// 仅当批内存在 measured_* 行时才触发这次证据读，hypothesis/inferred 零额外开销。
export const createFindings = async (rows: (typeof findings.$inferInsert)[]) => {
  if (!rows.length) return []
  const needsLevelCheck = rows.some(
    (r) => r.claimType === 'measured_hard' || r.claimType === 'measured_sample',
  )
  if (needsLevelCheck) {
    const refIds = [...new Set(rows.flatMap((r) => (r.evidenceRefs as string[] | null) ?? []))]
    const arts = refIds.length
      ? await db
          .select({ id: evidenceArtifacts.id, claimLevel: evidenceArtifacts.claimLevel })
          .from(evidenceArtifacts)
          .where(inArray(evidenceArtifacts.id, refIds))
      : []
    const levelById = new Map(arts.map((a) => [a.id, a.claimLevel as EvidenceLevel]))
    for (const r of rows) {
      const evidenceLevels = ((r.evidenceRefs as string[] | null) ?? [])
        .map((id) => levelById.get(id))
        .filter((l): l is EvidenceLevel => Boolean(l))
      assertFindingClaimEvidence({ claimType: r.claimType as ClaimType, evidenceLevels })
    }
  }
  return db.insert(findings).values(rows).returning()
}
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
  // 出向同站内链（TA01/TA02 群内邻接）；discovered_only 兜底页未抓 → null。
  internalLinks: string[] | null
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
          internalLinks: row.internalLinks,
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

// 多项目列表 + 每项目摘要（SP-G1b）：域名 / 市场 / 最近 run（状态·类型·发现数）/ 下次回测。
// V0 项目数个位数，逐项目查最近 run 与 finding 数可接受（不提前批量化，V1 再优化 N+1）。
export const listProjectsWithSummary = async () => {
  const projectRows = await db.select().from(projects).orderBy(desc(projects.createdAt))
  return Promise.all(
    projectRows.map(async (p) => {
      const runRows = await db.select().from(runs).where(eq(runs.projectId, p.id))
      const latest = pickLatestRun(runRows)
      const findingCount = latest
        ? (await db.select({ id: findings.id }).from(findings).where(eq(findings.runId, latest.id))).length
        : 0
      return {
        id: p.id,
        domain: p.domain,
        market: p.market,
        nextRetestDueAt: p.nextRetestDueAt,
        latestRun: latest
          ? { id: latest.id, runType: latest.runType, status: latest.status, startedAt: latest.startedAt, findingCount }
          : null,
      }
    }),
  )
}

// GSC OAuth 令牌存取（Phase B；SP-G1f：refresh_token 密文存储）。
export const setGscConnection = (
  projectId: string,
  data: { gscConnected: boolean; gscRefreshToken?: string | null; gscSiteUrl?: string | null },
) => {
  // token 提供时加密；省略则不动该列（部分更新语义不变）；显式 null 清空保持 null。
  const patch: typeof data = { ...data }
  if (typeof data.gscRefreshToken === 'string') patch.gscRefreshToken = encryptGscToken(data.gscRefreshToken)
  return db.update(projectSettings).set(patch).where(eq(projectSettings.projectId, projectId))
}

// GSC 站点 URL 单独写（连接后设，闭合采集器 gscConnected+refreshToken+siteUrl 条件）。
export const setGscSiteUrl = (projectId: string, siteUrl: string) =>
  db.update(projectSettings).set({ gscSiteUrl: siteUrl }).where(eq(projectSettings.projectId, projectId))

// 存量明文 refresh_token 迁移到密文（幂等：仅转非 v1. 前缀行）。部署后一次性跑（db:migrate-gsc）。
export const migrateGscRefreshTokensToEncrypted = async (): Promise<{ migrated: number }> => {
  const rows = await db
    .select({ projectId: projectSettings.projectId, token: projectSettings.gscRefreshToken })
    .from(projectSettings)
    .where(isNotNull(projectSettings.gscRefreshToken))
  let migrated = 0
  for (const r of rows) {
    if (r.token && !r.token.startsWith('v1.')) {
      await db.update(projectSettings).set({ gscRefreshToken: encryptGscToken(r.token) }).where(eq(projectSettings.projectId, r.projectId))
      migrated++
    }
  }
  return { migrated }
}

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

// —— Phase F 规则进化：提案 CRUD / 发版 / changelog / F3 统计 ——

export const createRuleChangeProposal = (row: typeof ruleChangeProposals.$inferInsert) => {
  // 无一手来源不入库（应用层强校验，对齐铁律）。
  if (!hasValidEvidence(row.evidenceRefs as string[] | null | undefined)) {
    throw new Error('proposal_evidence_required')
  }
  return db.insert(ruleChangeProposals).values(row).returning()
}

export const getRuleChangeProposals = (status?: 'pending' | 'approved' | 'rejected') =>
  status
    ? db.select().from(ruleChangeProposals).where(eq(ruleChangeProposals.status, status)).orderBy(desc(ruleChangeProposals.createdAt))
    : db.select().from(ruleChangeProposals).orderBy(desc(ruleChangeProposals.createdAt))

export const setProposalStatus = (id: string, status: 'approved' | 'rejected') =>
  db.update(ruleChangeProposals)
    .set({ status, reviewedAt: new Date().toISOString() })
    .where(eq(ruleChangeProposals.id, id))
    .returning()

// cron 幂等去重键：${source}::${target}，仅 pending。
export const getPendingProposalKeys = async (): Promise<Set<string>> => {
  const rows = await db
    .select({ source: ruleChangeProposals.source, target: ruleChangeProposals.target })
    .from(ruleChangeProposals)
    .where(eq(ruleChangeProposals.status, 'pending'))
  return new Set(rows.map((r) => `${r.source}::${r.target}`))
}

// 打包发版：所有 approved 且未发布的提案写版本号；update_artifact 类自动落地到 reference_artifacts。
export const releaseApprovedProposals = async (
  newVersion: string,
): Promise<{ released: number; artifactsUpdated: number }> => {
  // 守卫：重发已发布版本 / 发布不高于最大已发布版本即抛（SP-A1）。
  assertReleasableVersion(newVersion, await getReleasedVersions())

  const approved = await db
    .select()
    .from(ruleChangeProposals)
    .where(and(eq(ruleChangeProposals.status, 'approved'), isNull(ruleChangeProposals.releasedInRulesVersion)))
  let artifactsUpdated = 0
  const now = new Date()
  // 原子化：artifact 更新 + proposal 版本标记全成或全不成（本仓库首次用事务，SP-A1）。
  await db.transaction(async (tx) => {
    for (const p of approved) {
      if (p.changeType === 'update_artifact') {
        const artifact = await tx.query.referenceArtifacts.findFirst({
          where: eq(referenceArtifacts.artifactKey, p.target),
        })
        if (artifact) {
          const patch = computeArtifactUpdate(
            { version: artifact.version, payload: artifact.payload },
            p.diff as { payload?: unknown } | null,
            now,
          )
          await tx.update(referenceArtifacts).set(patch).where(eq(referenceArtifacts.artifactKey, p.target))
          artifactsUpdated++
        }
      }
      await tx.update(ruleChangeProposals).set({ releasedInRulesVersion: newVersion }).where(eq(ruleChangeProposals.id, p.id))
    }
  })
  return { released: approved.length, artifactsUpdated }
}

export const getReleasedProposals = () =>
  db
    .select()
    .from(ruleChangeProposals)
    .where(and(eq(ruleChangeProposals.status, 'approved'), isNotNull(ruleChangeProposals.releasedInRulesVersion)))
    .orderBy(desc(ruleChangeProposals.createdAt))

export const getReleasedVersions = async (): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ v: ruleChangeProposals.releasedInRulesVersion })
    .from(ruleChangeProposals)
    .where(isNotNull(ruleChangeProposals.releasedInRulesVersion))
  return rows.map((r) => r.v).filter((v): v is string => !!v)
}

// F3：按 rule_id 聚合的原料。findings 直取；recommendations 经 finding join 取 rule_id。均过滤 rule_id 非空。
export const getFindingStatRecords = async () => {
  const rows = await db
    .select({ id: findings.id, ruleId: findings.ruleId, status: findings.status })
    .from(findings)
    .where(isNotNull(findings.ruleId))
  return rows as { id: string; ruleId: string; status: 'open' | 'dismissed' | 'converted' }[]
}

export const getRecStatRecords = async () => {
  const rows = await db
    .select({ id: recommendations.id, ruleId: findings.ruleId, outcome: recommendations.outcome })
    .from(recommendations)
    .innerJoin(findings, eq(recommendations.findingId, findings.id))
    .where(isNotNull(findings.ruleId))
  return rows as { id: string; ruleId: string; outcome: 'unknown' | 'effective' | 'ineffective' | 'regressed' }[]
}

// —— BYOK 凭据读写（SP-G1c）——
export const getProviderCredentialRow = (key: string) =>
  db.query.providerCredentials.findFirst({ where: eq(providerCredentials.credentialKey, key) })

// 只取键判「已配置」，不解密、不外泄值（矩阵/UI 用）。
export const getConfiguredCredentialKeys = async (): Promise<string[]> => {
  const rows = await db.select({ k: providerCredentials.credentialKey }).from(providerCredentials)
  return rows.map((r) => r.k)
}

// 加密后 upsert（同键覆盖）；主键 = credentialKey，无需生成 id。
export const setProviderCredential = async (key: string, plaintext: string): Promise<void> => {
  const ciphertext = encryptSecret(plaintext)
  const now = new Date().toISOString()
  await db
    .insert(providerCredentials)
    .values({ credentialKey: key, ciphertext, updatedAt: now })
    .onConflictDoUpdate({ target: providerCredentials.credentialKey, set: { ciphertext, updatedAt: now } })
}

export const deleteProviderCredential = async (key: string): Promise<void> => {
  await db.delete(providerCredentials).where(eq(providerCredentials.credentialKey, key))
}

// —— 只读分享链接（SP-G1e）。
export const getReportShareByToken = (token: string) =>
  db.query.reportShares.findFirst({ where: eq(reportShares.token, token) })

// 复用该 run 未过期的现有分享（API 幂等：多次点「生成」不堆链接）；无则返回 null。
export const getActiveShareForRun = async (runId: string, now: Date) => {
  const rows = await db
    .select()
    .from(reportShares)
    .where(eq(reportShares.runId, runId))
    .orderBy(desc(reportShares.createdAt))
  return rows.find((r) => !isShareExpired(r.expiresAt, now)) ?? null
}

export const createReportShare = async (
  runId: string,
  locale: string,
  expiresAt: string | null = null,
) => {
  const [created] = await db
    .insert(reportShares)
    .values({ id: `share_${crypto.randomUUID()}`, runId, token: generateShareToken(), locale, expiresAt })
    .returning()
  return created
}

export * from './validators'
