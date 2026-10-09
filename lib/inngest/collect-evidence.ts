import { NonRetriableError } from 'inngest'
import { inngest } from './client'
import {
  COLLECT_REQUESTED_EVENT,
  type CollectRequestedEventData,
  type DiagnoseRequestedEventData,
  buildDiagnoseRequestedEvent,
} from './events'
import { runProgressChannel, type RunProgressMessage } from './channels'
import { assertPublicUrl, SsrfBlockedError } from '@/lib/security/ssrf-guard'
import { fetchPageFacts } from '@/lib/collection/page-parser'
import { fetchRobotsCheck } from '@/lib/collection/robots'
import { extractSchema } from '@/lib/collection/schema-extractor'
import { computeMainContentDelta } from '@/lib/collection/readability-risk'
import { fetchPageSpeedInsights, isPsiConfigured } from '@/lib/collection/psi'
import { collectUaProbe } from '@/lib/collection/ua-probe'
import { checkThirdPartyPresence } from '@/lib/collection/third-party-presence'
import { checkSocialPresence } from '@/lib/collection/social-presence'
import { GscAuthExpiredError, isGscPlatformConfigured, refreshAccessToken } from '@/lib/gsc/oauth'
import { querySearchAnalytics, mapRowsToKeywordMetrics } from '@/lib/gsc/search-analytics'
import { impressionWeightedAvgPosition } from '@/lib/gsc/avg-position'
import { createDataforseoProvider } from '@/lib/dataforseo'
import { collectDataforseoStage, type DataforseoStageArgs, type SubStageOutcome } from '@/lib/dataforseo/collect-stage'
import { resolveDataforseoCredentials } from '@/lib/credentials/dataforseo'
import type { DataforseoProvider } from '@/lib/dataforseo/types'
import { gatherSeedKeywords, type Seed } from '@/lib/diagnosis/seed-keywords'
import { sitePhrases } from '@/lib/diagnosis/site-phrases'
import { extractSitePreviewFacts } from '@/lib/analysis/category-candidates'
import { isUtilityPage } from '@/lib/crawl/link-integrity'
import { createAioSerpProviderFromEnv, createAioSerpProvider, type AioSerpProvider } from '@/lib/serp/dataforseo'
import { findMarket } from '@/lib/markets'
import { parseAioResult, AIO_PARSER_VERSION } from '@/lib/serp/aio-parse'
import { brandFromDomain, buildPromptSetV2 } from '@/lib/probes/prompt-set'
import { sha256Hex } from '@/lib/collection/hash'
import { packRaw } from '@/lib/collection/raw-store'
import type { RawResponse } from '@/lib/collection/result'
import { normalizeUrl } from '@/lib/crawl/url'
import { discoverSitemaps } from '@/lib/crawl/sitemap'
import { createCrawlState, runCrawlBatch, leftoverDiscovered, CRAWL_STRATEGY, SITEMAP_RESERVE_RATIO, type CrawlPageResult } from '@/lib/crawl/crawler'
import { buildLinkGraph, inboundAllByUrl, readLinkGraph, toLinkGraphInput } from '@/lib/crawl/link-graph'
import { selectExternalTargets, checkExternalLinks, EXTERNAL_CHECK_BATCH, EXTERNAL_CHECK_CAP, type ExternalCheckResult, type ExternalTarget } from '@/lib/crawl/external-check'
import { RUN_CANCELLED_REASON } from '@/lib/runs/status'
import { aggregateParentStatus, subSourceKey } from '@/lib/runs/source-status'
import type { DataSourceStatus } from '@/db/schema'
import type { LightCheckExtra } from '@/lib/crawl/light-check'
import { planTemplates } from '@/lib/crawl/template-cluster'
import { buildSiteAudit, type SiteAuditPage } from '@/lib/crawl/site-audit'
import type { RenderProvider } from '@/lib/render/render-provider'
import { selectRenderProvider } from '@/lib/render/provider-selection'
import { createGoogleCseSearchVisibilityProvider, type SearchVisibilityProvider } from '@/lib/search/search-visibility-provider'
import { collectProbesStage } from '@/lib/probes/run-probes'
import { buildProbeProviders } from '@/lib/probes/providers'
import { resolveCredentials } from '@/lib/credentials/store'
import { PROBE_CREDENTIAL_KEYS } from '@/lib/credentials/keys'
import { readGscToken } from '@/lib/gsc/token-crypto'
import {
  createEvidenceArtifact,
  markRunStatus,
  getProject,
  getProjectSettings,
  createPrompts,
  createAiProbeResult,
  createSerpAioResult,
  upsertSitePages,
  getSitePages,
  getRunSitePages,
  getRun,
  updateInboundCounts,
  syncUrlTemplates,
  getProjectTemplates,
  getRunProbeResults,
  getRunPrompts,
  getRunSerpAioResults,
  getRunSeedSerpRequests,
  upsertKeyword,
  createKeywordMetrics,
  upsertCompetitor,
  pruneCompetitorCandidates,
  upsertDataSourceStatus,
  getTargetKeywords,
  getGscKeywordHistory,
  createEvidenceRaw,
  linkEvidenceRaw,
} from '@/lib/repositories'
import type { DataSourceStatusUpsert } from '@/lib/repositories'

interface CollectStep {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

interface CollectArgs {
  event: { data: CollectRequestedEventData }
  step: CollectStep
  publish: (msg: unknown) => Promise<void>
}

interface CollectDeps {
  assertPublicUrl: typeof assertPublicUrl
  fetchPageFacts: typeof fetchPageFacts
  fetchRobotsCheck: typeof fetchRobotsCheck
  extractSchema: typeof extractSchema
  renderProvider: RenderProvider
  resolveRenderProvider?: () => Promise<RenderProvider>
  searchVisibilityProvider: SearchVisibilityProvider
  // PSI 性能采集（T09a-c 证据源）。免 key 可用；失败降级不阻断整轮采集。
  fetchPageSpeedInsights: typeof fetchPageSpeedInsights
  isPsiConfigured: typeof isPsiConfigured
  // GEO 深化采集（Phase D）：AI 爬虫可达性/llms.txt（G02/G08）+ 第三方语料（G07）。免 key，best-effort。
  collectUaProbe: typeof collectUaProbe
  checkThirdPartyPresence: typeof checkThirdPartyPresence
  // 社交/评价站前台存在度（YouTube/G2/Trustpilot/Capterra）。复用同一 CSE 通道
  // （searchVisibilityProvider），门控与 serp_snapshot 一致：未配置则跳过，不单独要 key。
  checkSocialPresence: typeof checkSocialPresence
  // GSC 关键词采集（K 组证据源）。仅在项目已连接 OAuth 时触发；失败降级不阻断。
  refreshGscAccessToken: (refreshToken: string) => Promise<{ accessToken: string }>
  isGscPlatformConfigured: () => Promise<boolean>
  querySearchAnalytics: typeof querySearchAnalytics
  upsertKeyword: typeof upsertKeyword
  createKeywordMetrics: typeof createKeywordMetrics
  // 种子词来源（SP-A §3.3）：用户目标词 + 历史 GSC 词。
  getTargetKeywords: typeof getTargetKeywords
  getGscKeywordHistory: typeof getGscKeywordHistory
  // DataForSEO 采集（Phase C，P3 缺口/P4 竞品/P5 外链证据源）。BYOK：凭据统一 DB>env 解析（SP-A §4.6），
  // 无凭据返回 null 时整块跳过；有凭据时附带原文缓冲区 drainRaws（provider 的 onResponse 写入）。
  resolveDataforseo: () => Promise<{ provider: DataforseoProvider; drainRaws: () => RawResponse[] } | null>
  runDataforseo: (args: DataforseoStageArgs) => Promise<SubStageOutcome[]>
  // AIO（Google AI Overviews）实测采集：与主采集共用 resolveDataforseoCredentials（DB>env）。
  // aioProvider 是 env 兜底同步构造；resolveAioProvider 可选注入 DB 优先解析（同 resolveRenderProvider 先例）。
  aioProvider: AioSerpProvider
  resolveAioProvider?: () => Promise<AioSerpProvider>
  createSerpAioResult: typeof createSerpAioResult
  getRunPrompts: typeof getRunPrompts
  getRunSerpAioResults: typeof getRunSerpAioResults
  // 起点体检的种子词 SERP 请求：同协议体检沿用起点的种子词样本（spec 2026-10-09 §5.3）。
  getRunSeedSerpRequests: typeof getRunSeedSerpRequests
  getProject: typeof getProject
  createEvidenceArtifact: typeof createEvidenceArtifact
  // 原始响应存档（SP-A §4.3）
  createEvidenceRaw: typeof createEvidenceRaw
  linkEvidenceRaw: typeof linkEvidenceRaw
  markRunStatus: typeof markRunStatus
  // AI 探针阶段整体注入：provider/key 过滤与失败兜底都在 stage 内部
  runProbes: (args: Parameters<typeof collectProbesStage>[0]) => ReturnType<typeof collectProbesStage>
  // 全站路由发现（spec: 2026-07-02-site-route-discovery）
  getProjectSettings: typeof getProjectSettings
  discoverSitemaps: typeof discoverSitemaps
  runCrawlBatch: typeof runCrawlBatch
  upsertSitePages: typeof upsertSitePages
  getSitePages: typeof getSitePages
  getRunSitePages: typeof getRunSitePages
  updateInboundCounts: typeof updateInboundCounts
  // 站外链接抽检（spec S2 §4）：注入以便单测不发真实请求。
  checkExternalLinks: (targets: ExternalTarget[]) => Promise<ExternalCheckResult[]>
  // 取消守卫（第二轮独立审查 #1）：写 site_pages / 证据前确认 run 未被用户取消。
  getRun: typeof getRun
  syncUrlTemplates: typeof syncUrlTemplates
  getProjectTemplates: typeof getProjectTemplates
  getRunProbeResults: typeof getRunProbeResults
  // 采集完成后触发诊断生成链（spec §5）。注入以便单测无副作用地断言其被调用。
  sendDiagnose: (data: DiagnoseRequestedEventData) => Promise<unknown>
  // 数据源状态写入（诊断报告合同 §3.1）：每个 provider 的 guard / 跳过 / 失败 / 成功 均落状态。
  writeDataSourceStatus: (input: DataSourceStatusUpsert) => Promise<unknown>
}

// GSC 查询窗口：数据有 ~2 天延迟，取 [今-31, 今-3] 的 28 天窗口。在 step 内计算以保重试幂等。
function gscDateRange(now = new Date()): { startDate: string; endDate: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return {
    startDate: fmt(new Date(now.getTime() - 31 * 86400000)),
    endDate: fmt(new Date(now.getTime() - 3 * 86400000)),
  }
}

function errorReason(err: unknown, fallback = 'collection_failed'): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'object' && err && 'message' in err && typeof err.message === 'string' && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return fallback
}

// 起点体检记下的种子词样本：seed_serp 证据 request.seeds（collect-stage 写入，顺序即当时的采样顺序）。
// 没有这条证据、没记种子、为空或形状不对 → null（调用方重新采样）。
function recordedSeeds(requests: unknown[]): Seed[] | null {
  for (const req of requests) {
    const seeds = (req as { seeds?: unknown } | null)?.seeds
    if (!Array.isArray(seeds) || seeds.length === 0) continue
    const valid = seeds.every((s) => {
      const x = s as Partial<Seed> | null
      return !!x && typeof x.text === 'string' && x.text.trim() !== '' && typeof x.source === 'string'
    })
    if (valid) return seeds as Seed[]
  }
  return null
}

// 本 run 页面 → 图谱输入（spec S1 §6）：内容类型与截断标志在 light_check_extra 里，决定「出链是否完整已知」。
const toGraphInput = (p: Awaited<ReturnType<typeof getRunSitePages>>[number]) =>
  toLinkGraphInput({ ...p, extra: p.lightCheckExtra as LightCheckExtra | null })

function defaultDeps(): CollectDeps {
  return {
    assertPublicUrl,
    fetchPageFacts,
    fetchRobotsCheck,
    extractSchema,
    renderProvider: selectRenderProvider(process.env),
    resolveRenderProvider: async () => selectRenderProvider(await resolveCredentials([
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
      'BROWSERLESS_API_TOKEN',
      'BROWSERLESS_CONTENT_URL',
    ])),
    searchVisibilityProvider: createGoogleCseSearchVisibilityProvider({
      apiKey: process.env.GOOGLE_CSE_API_KEY ?? '',
      cx: process.env.GOOGLE_CSE_CX ?? '',
    }),
    fetchPageSpeedInsights,
    isPsiConfigured,
    collectUaProbe,
    checkThirdPartyPresence,
    checkSocialPresence,
    refreshGscAccessToken: (refreshToken) => refreshAccessToken(refreshToken),
    isGscPlatformConfigured: async () => isGscPlatformConfigured(),
    querySearchAnalytics,
    upsertKeyword,
    createKeywordMetrics,
    getTargetKeywords,
    getGscKeywordHistory,
    resolveDataforseo: async () => {
      const creds = await resolveDataforseoCredentials()
      if (!creds) return null
      // 原文缓冲：每个 HTTP 响应进 buf，由采集阶段在同一个 step 内 drain 并存档（SP-A §4.3）。
      const buf: RawResponse[] = []
      return {
        provider: createDataforseoProvider({ ...creds, onResponse: ({ raw }) => { buf.push(raw) } }),
        drainRaws: () => buf.splice(0),
      }
    },
    runDataforseo: (args) => collectDataforseoStage(args, { createEvidenceArtifact, upsertCompetitor, linkEvidenceRaw, pruneCompetitorCandidates }),
    aioProvider: createAioSerpProviderFromEnv(),
    resolveAioProvider: async () => {
      // AIO 与主采集共用 DataForSEO 凭据解析（DB>env，SP-A §4.6）。
      const creds = await resolveDataforseoCredentials()
      return createAioSerpProvider({ login: creds?.login ?? '', password: creds?.password ?? '' })
    },
    createSerpAioResult,
    getRunPrompts,
    getRunSerpAioResults,
    getRunSeedSerpRequests,
    getProject,
    createEvidenceArtifact,
    createEvidenceRaw,
    linkEvidenceRaw,
    markRunStatus,
    runProbes: async (args) => {
      // 探针 key 走 DB>env 解析（BYOK 设置页录入优先于环境变量）。
      const creds = await resolveCredentials(PROBE_CREDENTIAL_KEYS)
      return collectProbesStage(args, {
        getProject,
        getProjectSettings,
        buildProviders: () => buildProbeProviders(creds),
        createPrompts,
        getRunPrompts,
        createEvidenceArtifact,
        createAiProbeResult,
      })
    },
    getProjectSettings,
    discoverSitemaps,
    runCrawlBatch,
    upsertSitePages,
    getSitePages,
    getRunSitePages,
    updateInboundCounts,
    checkExternalLinks: (targets) => checkExternalLinks(targets),
    getRun,
    syncUrlTemplates,
    getProjectTemplates,
    getRunProbeResults,
    sendDiagnose: (data) => inngest.send(buildDiagnoseRequestedEvent(data)),
    writeDataSourceStatus: (input) => upsertDataSourceStatus(input),
  }
}

export async function collectEvidenceHandler(
  { event, step, publish }: CollectArgs,
  deps: CollectDeps = defaultDeps(),
): Promise<{ status: 'collected' }> {
  const { runId, projectId, url, baselineRunId } = event.data
  const channel = runProgressChannel(runId)
  // channel.progress() 返回的是 Promise<envelope>，先 await 拿到 {channel,topic,data}
  // 再交给 publish（ctx.publish 接受 MaybePromise，测试里也据此断言 .data 形状）。
  const emit = async (msg: RunProgressMessage) => publish(await channel.progress(msg))

  // step.run 的返回值会经 JSON 序列化往返，URL 对象会退化成 href 字符串（URL.toJSON()），
  // 之后再 .hostname 就是 undefined。所以这里让 step 只返回校验后的 href 字符串，
  // URL 的解析放到 step 外用 new URL(entryUrl) 重建（entryUrl 已是校验过的绝对地址，安全）。
  let entryUrl: string
  try {
    entryUrl = await step.run('validate-url', async () => (await deps.assertPublicUrl(url)).toString())
  } catch (err) {
    const reason = errorReason(err, 'invalid_url')
    await step.run('mark-failed-ssrf', () =>
      deps.markRunStatus(runId, 'failed', { failureReason: reason, finishedAt: new Date().toISOString() }),
    )
    await emit({ type: 'failed', reason })
    if (err instanceof SsrfBlockedError) throw new NonRetriableError(reason)
    throw err
  }
  const domain = new URL(entryUrl).hostname.replace(/^www\./, '')
  // 入口 URL 归一：entryUrl 来自 SSRF 校验，可能带 www / 未归一。用归一后的 entrySeed 作为
  // 爬取种子、模板聚类 entry、深检排除比较的锚，避免入口页以两种写法被爬两次 / 深检两次。
  // 入口页自身的 fetch-page / render 仍用原 entryUrl（既有行为不动）。
  const entrySeed = normalizeUrl(entryUrl) ?? entryUrl

  await emit({ type: 'progress', pct: 8 })

  // —— 数据源状态写入（报告合同 §3.1）——
  // 辅助：简化 writeDataSourceStatus 调用
  // 原始响应存档（SP-A §4.3）：必须在取数的同一个 step 里调用——step 返回值会被 Inngest 记忆化回放，原文不能跨 step 传。
  // 先以无 evidence_id 落库，证据写好后再 linkEvidenceRaw 挂上；采集失败的原文照样留档。
  const persistRawRow = async (sourceKey: string, raw: RawResponse): Promise<string> => {
    const id = `raw_${crypto.randomUUID()}`
    await deps.createEvidenceRaw({
      id, runId, evidenceId: null, sourceKey, httpStatus: raw.status, contentType: raw.contentType, encoding: 'gzip', ...packRaw(raw),
    })
    return id
  }

  const writeDss = async (input: Omit<DataSourceStatusUpsert, 'runId'>) => {
    // 覆盖度遥测不能把原本可降级的诊断任务变成失败任务；实际采集证据仍由各 provider 的错误路径负责。
    try {
      return await step.run(`dss-${input.sourceKey}`, () => deps.writeDataSourceStatus({ runId, ...input }))
    } catch {
      return undefined
    }
  }
  // 渲染凭据与其他 BYOK 一样以 DB 优先、env 回退解析；Cloudflare 未配时自动选 Browserless。
  const renderProvider = deps.resolveRenderProvider ? await deps.resolveRenderProvider() : deps.renderProvider

  // Google CSE 可见性信号
  const cseConfigured = deps.searchVisibilityProvider.isConfigured()
  if (cseConfigured) {
    try {
      const visibility = await step.run('google-site-visibility', () => deps.searchVisibilityProvider.checkSite(domain))
      const rawText = JSON.stringify(visibility)
      await step.run('persist-serp-snapshot', () =>
        deps.createEvidenceArtifact({
          id: `ev_${crypto.randomUUID()}`,
          projectId,
          runId,
          type: 'serp_snapshot',
          claimLevel: 'L2',
          source: 'google_custom_search',
          request: { query: visibility.query, domain, note: 'Google search front-end visibility signal, not GSC index truth' },
          payload: visibility,
          rawText,
          rawHash: sha256Hex(rawText),
        }),
      )
      await emit({ type: 'evidence_created', evidenceType: 'serp_snapshot' })
      await writeDss({ sourceKey: 'google_cse', configured: true, authorized: true, attempted: true, status: 'collected', capturedEvidenceCount: 1 })
    } catch (err) {
      await writeDss({ sourceKey: 'google_cse', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: errorReason(err) })
    }
  } else {
    await writeDss({ sourceKey: 'google_cse', configured: false, authorized: false, attempted: false, status: 'not_configured' })
  }
  await emit({ type: 'progress', pct: 20 })

  const pageFacts = await step.run('fetch-page', () => deps.fetchPageFacts(entryUrl))
  const robots = await step.run('check-robots', () => deps.fetchRobotsCheck(entryUrl))
  await step.run('persist-page-fetch', () =>
    deps.createEvidenceArtifact({
      id: `ev_${crypto.randomUUID()}`,
      projectId,
      runId,
      type: 'page_fetch',
      claimLevel: 'L4',
      source: entryUrl,
      // robotsTxt 原文并入入口 page_fetch payload：G01 用 parseRobotsAllowed 逐 UA 判检索爬虫屏蔽，
      // 免于新增一种 evidence 类型 / schema 迁移。
      payload: {
        canonicalUrl: pageFacts.canonicalUrl,
        metaRobots: pageFacts.metaRobots,
        robotsAllowed: robots.allowed,
        robotsTxt: robots.rawText,
      },
      rawText: pageFacts.rawHtml,
      rawHash: sha256Hex(pageFacts.rawHtml),
    }),
  )
  await emit({ type: 'evidence_created', evidenceType: 'page_fetch' })
  await emit({ type: 'progress', pct: 45 })

  const schema = await step.run('extract-schema', () => deps.extractSchema(pageFacts.rawHtml))
  await step.run('persist-schema', () =>
    deps.createEvidenceArtifact({
      id: `ev_${crypto.randomUUID()}`,
      projectId,
      runId,
      type: 'schema',
      claimLevel: 'L4',
      source: entryUrl,
      // sameAs（E01 实体消歧）+ blocks 语法有效性（C05b）随 payload 落库；raw JSON-LD 仍存 rawText。
      payload: {
        types: schema.types,
        sameAs: schema.sameAs,
        blocks: schema.blocks.map((b) => ({ ok: b.ok, rawText: b.rawText })),
      },
      rawText: JSON.stringify(schema.raw),
      rawHash: sha256Hex(JSON.stringify(schema.raw)),
    }),
  )
  await emit({ type: 'evidence_created', evidenceType: 'schema' })
  await emit({ type: 'progress', pct: 65 })

  // —— 全站路由发现 + 轻检（spec: 2026-07-02-site-route-discovery §4）——
  const settings = await step.run('load-crawl-settings', () => deps.getProjectSettings(projectId))
  // 市场单一真源（SP-A §3.1）：GSC 国家过滤与关键词入库都按项目市场 code。
  const projectRow = await step.run('load-project', () => deps.getProject(projectId))
  const projectMarket = findMarket(projectRow?.market ?? '')
  const crawlEnabled = settings?.crawlEnabled ?? true
  // 站外链接抽检结果（spec S2 §4）：抓取后分批检测，结果小（url/status/error），跨 step 传到 site_audit。
  const externalChecks: ExternalCheckResult[] = []
  let externalCheckProtocol = { cap: EXTERNAL_CHECK_CAP, checked: 0, skippedUrls: 0, failedBatches: 0 }
  // 用户取消后在途的 Inngest 任务不会被强杀（见 cancel 路由）：写 site_pages 前检查，避免已取消的 run
  // 把新 run 的行 lastSeenRunId 抢走、造成新快照缺页与 T05 实测误报（第二轮独立审查 #1）。
  const assertNotCancelled = async () => {
    const r = await deps.getRun(runId)
    if (r?.failureReason === RUN_CANCELLED_REASON) throw new NonRetriableError('run_cancelled')
  }
  const maxPages = settings?.crawlMaxPages ?? 200
  const maxDepth = settings?.crawlMaxDepth ?? 3

  if (crawlEnabled) {
    await emit({ type: 'phase', phase: 'discover' })
    const sitemaps = await step.run('discover-sitemap', () => deps.discoverSitemaps(entryUrl, robots.rawText))
    for (const [i, file] of sitemaps.files.entries()) {
      await step.run(`persist-sitemap-${i}`, () =>
        deps.createEvidenceArtifact({
          id: `ev_${crypto.randomUUID()}`,
          projectId,
          runId,
          type: 'sitemap',
          claimLevel: 'L4',
          source: file.url,
          payload: { warnings: sitemaps.warnings, pageUrlCount: sitemaps.pageUrls.length },
          rawText: file.xml,
          rawHash: sha256Hex(file.xml),
        }),
      )
      await emit({ type: 'evidence_created', evidenceType: 'sitemap' })
    }

    // createCrawlState 是纯函数且输入已被 step 记忆化，无需再包 step。
    // 抓取请求原始地址（用户输入的入口、sitemap 里的 <loc>），归一化只作去重键（第二轮独立审查 #6）。
    const fetchUrls: Record<string, string> = { ...(sitemaps.fetchUrls ?? {}) }
    if (entryUrl !== entrySeed) fetchUrls[entrySeed] = entryUrl
    let crawlState = createCrawlState(entrySeed, sitemaps.pageUrls, domain, { fetchUrls })
    const crawlOpts = { maxPages, maxDepth, batchSize: 20, concurrency: 4, robotsTxt: robots.rawText }
    const toUpsert = (r: CrawlPageResult) => ({
      url: r.url,
      discoveredVia: r.discoveredVia,
      depth: r.depth,
      httpStatus: r.httpStatus || null,
      finalUrl: r.finalUrl !== r.url ? r.finalUrl : null,
      title: r.title,
      canonicalUrl: r.canonicalUrl,
      metaRobots: r.metaRobots,
      mainTextChars: r.mainTextChars,
      contentHash: r.contentHash || null,
      internalLinks: r.internalLinks,
      linkDetails: r.linkDetails,
      externalLinks: r.externalLinks,
      lightCheckExtra: r.extra,
      checkStatus: r.checkStatus,
      errorReason: r.errorReason,
    })
    let batchIdx = 0
    const maxBatches = Math.ceil(maxPages / crawlOpts.batchSize) + 5 // 保险丝：防状态机 bug 造成死循环
    while (!crawlState.done && batchIdx < maxBatches) {
      const snapshot = crawlState
      // 抓取与落库同一 step（spec S1 §7）：抓取结果（含链接明细）不进入 Inngest 状态，只回传状态与计数。
      // step id 带 v2：S1 改了返回形状，部署时正在跑的旧 run 不会拿旧记忆化结果喂新代码（独立审查 P6）。
      const batch = await step.run(`crawl-v2-batch-${batchIdx}`, async () => {
        const out = await deps.runCrawlBatch(snapshot, crawlOpts)
        await assertNotCancelled() // 抓取耗时长，写库前再查一次，把窗口压到毫秒级
        if (out.results.length) await deps.upsertSitePages(projectId, runId, out.results.map(toUpsert))
        return { state: out.state, resultCount: out.results.length }
      })
      crawlState = batch.state
      await emit({ type: 'phase', phase: 'light_check', checked: crawlState.checkedCount, total: maxPages })
      batchIdx++
    }
    const leftover = leftoverDiscovered(crawlState)
    if (leftover.length) {
      // id 带 v2：语义随 S1 变化，避免部署过渡期旧 run 跳过本步（第二轮独立审查 #10）。
      await step.run('persist-discovered-only-v2', async () => {
        await assertNotCancelled()
        await deps.upsertSitePages(
          projectId,
          runId,
          leftover.map((l) => ({
            url: l.url, discoveredVia: l.via, depth: l.depth, httpStatus: null, finalUrl: null,
            title: null, canonicalUrl: null, metaRobots: null, mainTextChars: null, contentHash: null,
            internalLinks: null, linkDetails: null, externalLinks: null, lightCheckExtra: null,
            checkStatus: 'discovered_only' as const, errorReason: null,
          })),
        )
      })
    }
    // 入度来自本 run 图谱（spec S1 §5/§7）：只写本 run 存在行的 URL，先清零再写（修 D5）。
    await step.run('update-inbound-counts-v2', async () => {
      await assertNotCancelled()
      const pages = await deps.getRunSitePages(projectId, runId)
      const inbound = inboundAllByUrl(buildLinkGraph({ entryUrl: entrySeed, pages: pages.map(toGraphInput) }))
      await deps.updateInboundCounts(projectId, runId, Object.fromEntries(pages.map((p) => [p.url, inbound[p.url] ?? 0])))
    })

    // 站外目标从链接图谱里选：图谱只收本站 HTML 源页的出链（第二轮独立审查 #4）。
    const externalTargets = await step.run('select-external-targets', async () => {
      const pages = await deps.getRunSitePages(projectId, runId)
      const view = readLinkGraph({ linkGraph: buildLinkGraph({ entryUrl: entrySeed, pages: pages.map(toGraphInput) }) })
      return selectExternalTargets(view?.external ?? [])
    })
    let failedBatches = 0
    for (let i = 0; i * EXTERNAL_CHECK_BATCH < externalTargets.targets.length; i++) {
      const chunk = externalTargets.targets.slice(i * EXTERNAL_CHECK_BATCH, (i + 1) * EXTERNAL_CHECK_BATCH)
      try {
        externalChecks.push(...(await step.run(`check-external-links-${i}`, () => deps.checkExternalLinks(chunk))))
      } catch {
        // 单批失败（函数超时、重试耗尽）不拖垮整轮 run：该批记 not_checked，L07 不对其下结论（第二轮独立审查 #9）。
        failedBatches++
        externalChecks.push(...chunk.map((t) => ({ url: t.url, status: null, error: 'not_checked' as const })))
      }
    }
    externalCheckProtocol = {
      cap: EXTERNAL_CHECK_CAP,
      checked: externalChecks.filter((c) => c.error !== 'not_checked').length,
      skippedUrls: externalTargets.skippedUrls,
      failedBatches,
    }

    await emit({ type: 'phase', phase: 'cluster' })
    await step.run('cluster-templates', async () => {
      const pages = await deps.getSitePages(projectId)
      const candidates = pages
        .filter((p) => p.checkStatus === 'checked')
        .map((p) => ({ url: p.url, mainTextChars: p.mainTextChars, httpStatus: p.httpStatus, checkStatus: p.checkStatus }))
      await deps.syncUrlTemplates(projectId, planTemplates(candidates, entrySeed))
    })
    await writeDss({
      sourceKey: 'crawl',
      configured: true,
      authorized: true,
      attempted: true,
      status: leftover.length ? 'partial' : 'collected',
      capturedEvidenceCount: crawlState.checkedCount,
      protocolSnapshot: {
        maxPages, maxDepth, truncated: leftover.length, crawlStrategy: CRAWL_STRATEGY, sitemapReserveRatio: SITEMAP_RESERVE_RATIO,
        externalCheck: externalCheckProtocol,
      },
    })
  } else {
    await writeDss({ sourceKey: 'crawl', configured: true, authorized: true, attempted: false, status: 'not_attempted', protocolSnapshot: { crawlEnabled: false } })
  }

  if (renderProvider.isConfigured?.() ?? true) {
    const rendered = await step.run('render-check', () => renderProvider.renderMainText(entryUrl))
    const delta = computeMainContentDelta(pageFacts.mainTextChars, rendered.mainTextChars)
    await step.run('persist-render-check', () =>
      deps.createEvidenceArtifact({
        id: `ev_${crypto.randomUUID()}`,
        projectId,
        runId,
        type: 'render_check',
        claimLevel: 'L4',
        source: entryUrl,
        payload: {
          initialHtmlMainTextChars: pageFacts.mainTextChars,
          renderedMainTextChars: rendered.mainTextChars,
          mainContentDelta: delta,
        },
        rawText: rendered.html,
        rawHash: sha256Hex(rendered.html),
      }),
    )
    await emit({ type: 'evidence_created', evidenceType: 'render_check' })
    await writeDss({ sourceKey: 'render', configured: true, authorized: true, attempted: true, status: 'collected', capturedEvidenceCount: 1 })
  } else {
    // 没有托管浏览器也不阻断，但如实记"未配置、未尝试"：渲染对比根本没做，不是"部分采集"（验收新发现 4）。
    // 快照只说明本轮靠静态 HTML（page_fetch）兜底；PSI 在后面才采、可能失败，不预先列为兜底证据。
    await writeDss({
      sourceKey: 'render', configured: false, authorized: false, attempted: false, status: 'not_configured',
      capturedEvidenceCount: 0,
      protocolSnapshot: {
        mode: 'static_html_fallback',
        evidence: ['page_fetch'],
        limitation: 'rendered DOM and JavaScript content delta were not captured',
      },
    })
  }

  // —— PSI 性能采集（T09a-c）——：入口页移动端 CWV 字段数据 + Lighthouse 实验室线索。
  // 免 key 可用；单次失败（配额/网络）不阻断采集，psi 证据缺失时 T09 规则整体 no-op。
  // SP-A §4.1：失败如实记原因（http_429 / invalid_json / empty_result / network_error），不写 psi 证据——
  // 此前配额错误被解析成全 null 并记 collected，P1 健康分把它当成测过。
  if (deps.isPsiConfigured()) {
    try {
      const psi = await step.run('fetch-psi', async () => {
        const r = await deps.fetchPageSpeedInsights(entryUrl, 'mobile')
        const rawId = r.raw ? await persistRawRow('psi', r.raw) : null
        return r.ok ? { ok: true as const, value: r.value, rawId } : { ok: false as const, reason: r.reason, rawId }
      })
      if (psi.ok) {
        // rawText 仍存解析后的 JSON（现有规则读 payload），响应原文另存 evidence_raw。
        const rawText = JSON.stringify(psi.value)
        await step.run('persist-psi', async () => {
          const id = `ev_${crypto.randomUUID()}`
          await deps.createEvidenceArtifact({
            id,
            projectId,
            runId,
            type: 'psi',
            // CrUX 字段数据为真实用户测量（L4）；Lighthouse 实验室部分在同一 artifact，规则按 hasFieldData 分级。
            claimLevel: 'L4',
            source: entryUrl,
            request: { strategy: 'mobile', note: 'CrUX field data = ranking signal (L4); Lighthouse lab = diagnostic only, not ranking input' },
            payload: psi.value,
            rawText,
            rawHash: sha256Hex(rawText),
          })
          if (psi.rawId) await deps.linkEvidenceRaw([psi.rawId], id)
        })
        await emit({ type: 'evidence_created', evidenceType: 'psi' })
        await writeDss({ sourceKey: 'psi', configured: true, authorized: true, attempted: true, status: 'collected', capturedEvidenceCount: 1 })
      } else {
        await writeDss({ sourceKey: 'psi', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: psi.reason })
      }
    } catch {
      // 采集器自身不抛错；这里兜的是存档/落库等意外异常——PSI 只降级，不影响其余证据与诊断触发。
      await writeDss({ sourceKey: 'psi', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: 'unexpected_error' })
    }
  } else {
    await writeDss({ sourceKey: 'psi', configured: false, authorized: false, attempted: false, status: 'not_configured' })
  }

  // GSC query 维 Top 展示词：作为 DataForSEO 种子词的真实需求来源（未连 GSC 时留空，种子仅来自探针）。
  let gscTopQueries: { keyText: string; impressions: number }[] = []

  // —— GSC 关键词采集（K 组）——：已连接 OAuth 的项目拉 query 维 + page×query 交叉维，
  // 落 gsc 证据（供规则）+ keyword_metrics（供关键词现状 tab 与回测）。未连接则整块跳过，K 组 no-op。
  const refreshToken = readGscToken(settings?.gscRefreshToken)
  const gscAppConfigured = await deps.isGscPlatformConfigured()
  const gscProjectAuthorized = Boolean(settings?.gscConnected && refreshToken && settings.gscSiteUrl)
  if (gscAppConfigured && gscProjectAuthorized && refreshToken && settings?.gscSiteUrl) {
    const siteUrl = settings.gscSiteUrl
    try {
      const gsc = await step.run('gsc-query', async () => {
        let accessToken: string
        try {
          accessToken = (await deps.refreshGscAccessToken(refreshToken)).accessToken
        } catch (err) {
          // 授权失效（invalid_grant）重试也解决不了：标成不可重试，Inngest 不再退避重试（实测每轮白等约 2.5 分钟），
          // 外层 catch 立即记 failed；StepError 沿用原消息，失败原因不变（验收新发现 2）。暂时性错误照常抛出、交给重试。
          if (err instanceof GscAuthExpiredError) throw new NonRetriableError(err.message, { cause: err })
          throw err
        }
        const range = gscDateRange()
        const [queryRows, queryPageRows] = await Promise.all([
          deps.querySearchAnalytics(accessToken, siteUrl, { ...range, dimensions: ['query'], rowLimit: 1000, country: projectMarket?.gscCountry ?? null }),
          deps.querySearchAnalytics(accessToken, siteUrl, { ...range, dimensions: ['page', 'query'], rowLimit: 1000, country: projectMarket?.gscCountry ?? null }),
        ])
        return { queryRows, queryPageRows, range }
      })

      // 供 DataForSEO 种子词收集（按展示量取头部）。
      gscTopQueries = gsc.queryRows
        .filter((r) => r.keys[0])
        .map((r) => ({ keyText: r.keys[0], impressions: r.impressions }))

      // query 维证据：K01/K02 的取数锚。keyword_metrics 也引用它作 evidenceId。
      const avgPosition = impressionWeightedAvgPosition(gsc.queryRows)
      const queryRaw = JSON.stringify(gsc.queryRows)
      // 证据 ID 必须由 durable step 一并返回。Inngest 重放时会跳过已完成的
      // step；若在 step 外重新生成 ID，后续指标会引用一个从未入库的证据行。
      const queryEvidence = await step.run('persist-gsc-query', async () => {
        const evidenceId = `ev_${crypto.randomUUID()}`
        await deps.createEvidenceArtifact({
          id: evidenceId, projectId, runId, type: 'gsc', claimLevel: 'L4', source: siteUrl,
          request: { dimension: 'query', ...gsc.range },
          payload: { dimension: 'query', rows: gsc.queryRows, avgPosition },
          rawText: queryRaw, rawHash: sha256Hex(queryRaw),
        })
        return { evidenceId }
      })

      // page×query 交叉维证据：K06 蚕食检测（keys=[page, query]）。
      const qpRaw = JSON.stringify(gsc.queryPageRows)
      await step.run('persist-gsc-querypage', () =>
        deps.createEvidenceArtifact({
          id: `ev_${crypto.randomUUID()}`, projectId, runId, type: 'gsc', claimLevel: 'L4', source: siteUrl,
          request: { dimension: 'queryPage', ...gsc.range },
          payload: { dimension: 'queryPage', rows: gsc.queryPageRows },
          rawText: qpRaw, rawHash: sha256Hex(qpRaw),
        }),
      )

      // keywords + keyword_metrics（query 维 top 200 by impressions）落库。规则不依赖此表（读证据），
      // 但关键词现状 tab 与同协议回测需要；evidenceId 挂 query 维证据满足证据引用约束。
      await step.run('persist-gsc-keyword-metrics', async () => {
        const metrics = mapRowsToKeywordMetrics(gsc.queryRows, 'query')
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 200)
        const metricRows: Parameters<typeof deps.createKeywordMetrics>[0] = []
        for (const m of metrics) {
          const [kw] = await deps.upsertKeyword({
            id: `kw_${crypto.randomUUID()}`, projectId, text: m.keyText, market: projectRow?.market ?? '', language: 'en', source: 'gsc', intent: '',
          })
          metricRows.push({
            id: `km_${crypto.randomUUID()}`, runId, keywordId: kw.id, source: 'gsc',
            impressions: m.impressions, clicks: m.clicks, ctr: m.ctr, position: m.position, evidenceId: queryEvidence.evidenceId,
          })
        }
        await deps.createKeywordMetrics(metricRows)
      })
      await emit({ type: 'evidence_created', evidenceType: 'gsc' })
      await writeDss({ sourceKey: 'gsc', configured: true, authorized: true, attempted: true, status: 'collected', capturedEvidenceCount: 2, protocolSnapshot: { siteUrl, dateRange: gscDateRange() } })
    } catch (err) {
      // GSC 失败（令牌过期/权限/网络）仅降级，不阻断采集与诊断。
      await writeDss({ sourceKey: 'gsc', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: errorReason(err) })
    }
  } else {
    // GSC 运行环境和项目授权是两件事：OAuth 三件套存在但项目未连时，应提示未授权而非未配置。
    await writeDss({
      sourceKey: 'gsc',
      configured: gscAppConfigured,
      authorized: gscProjectAuthorized,
      attempted: false,
      status: gscAppConfigured ? 'not_authorized' : 'not_configured',
    })
  }

  // 深检页 H1（spec §3.3 站点短语来源）：从记忆化的 deep-fetch 结果里提取，重放时结果相同。
  const deepH1s: string[] = []

  // —— 模板代表页 + 重点页深检：渲染调用数 = 模板数 + 重点页数，而非全站页数 ——
  async function deepCheckTarget(target: { url: string; sitePageId: string }) {
    const facts = await step.run(`deep-fetch:${target.url}`, () => deps.fetchPageFacts(target.url))
    const deepH1 = extractSitePreviewFacts(facts.rawHtml).h1
    if (deepH1 && !isUtilityPage(target.url)) deepH1s.push(deepH1)
    await step.run(`deep-persist-fetch:${target.url}`, () =>
      deps.createEvidenceArtifact({
        id: `ev_${crypto.randomUUID()}`, projectId, runId, type: 'page_fetch', claimLevel: 'L4',
        source: target.url, sitePageId: target.sitePageId,
        payload: { canonicalUrl: facts.canonicalUrl, metaRobots: facts.metaRobots },
        rawText: facts.rawHtml, rawHash: sha256Hex(facts.rawHtml),
      }),
    )
    const deepSchema = await step.run(`deep-schema:${target.url}`, () => deps.extractSchema(facts.rawHtml))
    await step.run(`deep-persist-schema:${target.url}`, () =>
      deps.createEvidenceArtifact({
        id: `ev_${crypto.randomUUID()}`, projectId, runId, type: 'schema', claimLevel: 'L4',
        source: target.url, sitePageId: target.sitePageId,
        payload: {
          types: deepSchema.types,
          sameAs: deepSchema.sameAs,
          blocks: deepSchema.blocks.map((b) => ({ ok: b.ok, rawText: b.rawText })),
        },
        rawText: JSON.stringify(deepSchema.raw), rawHash: sha256Hex(JSON.stringify(deepSchema.raw)),
      }),
    )
    if (renderProvider.isConfigured?.() ?? true) {
      const deepRendered = await step.run(`deep-render:${target.url}`, () => renderProvider.renderMainText(target.url))
      const deepDelta = computeMainContentDelta(facts.mainTextChars, deepRendered.mainTextChars)
      await step.run(`deep-persist-render:${target.url}`, () =>
        deps.createEvidenceArtifact({
          id: `ev_${crypto.randomUUID()}`, projectId, runId, type: 'render_check', claimLevel: 'L4',
          source: target.url, sitePageId: target.sitePageId,
          payload: {
            initialHtmlMainTextChars: facts.mainTextChars,
            renderedMainTextChars: deepRendered.mainTextChars,
            mainContentDelta: deepDelta,
          },
          rawText: deepRendered.html, rawHash: sha256Hex(deepRendered.html),
        }),
      )
    }
  }

  if (crawlEnabled) {
    const targets = await step.run('resolve-deep-check-targets', async () => {
      const [pages, templates] = await Promise.all([deps.getSitePages(projectId), deps.getProjectTemplates(projectId)])
      const byId = new Map(pages.map((p) => [p.id, p]))
      const picked = new Map<string, string>() // url -> sitePageId
      for (const tpl of templates) {
        const rep = tpl.representativePageId ? byId.get(tpl.representativePageId) : undefined
        if (rep && rep.url !== entrySeed && rep.httpStatus === 200) picked.set(rep.url, rep.id)
      }
      for (const p of pages) {
        if (p.isKeyPage && p.url !== entrySeed && p.checkStatus === 'checked') picked.set(p.url, p.id)
      }
      return [...picked.entries()].map(([url, sitePageId]) => ({ url, sitePageId }))
    })
    await emit({ type: 'phase', phase: 'deep_check', total: targets.length })
    for (const target of targets) {
      // 单模板深检失败不中断 run（spec §8）：该目标跳过，其余继续。
      // step.run 内部仍由 Inngest 重试；这里兜的是重试耗尽后的最终失败。
      try {
        await deepCheckTarget(target)
      } catch {
        await emit({ type: 'phase', phase: 'deep_check', checked: targets.indexOf(target) + 1, total: targets.length })
      }
    }
  }

  // AI 探针（20 prompts × provider × n）：进度在 65→90 区间由 stage 自行推进
  try {
    const probe = await deps.runProbes({ step, emit, runId, projectId, entryUrl, baselineRunId })
    if (probe.probedProviders.length === 0) {
      await writeDss({ sourceKey: 'ai_probe', configured: false, authorized: false, attempted: false, status: 'not_configured' })
    } else if (probe.successfulCount === 0) {
      await writeDss({
        sourceKey: 'ai_probe', configured: true, authorized: true, attempted: true, status: 'failed',
        failureReason: 'no_valid_probe_results',
        protocolSnapshot: { providers: probe.probedProviders, promptCount: probe.promptCount, attemptedSamples: probe.attemptedCount, validSamples: 0 },
      })
    } else {
      await writeDss({
        sourceKey: 'ai_probe', configured: true, authorized: true, attempted: true,
        status: probe.successfulCount < probe.attemptedCount ? 'partial' : 'collected',
        capturedEvidenceCount: probe.successfulCount,
        protocolSnapshot: {
          providers: probe.probedProviders,
          promptCount: probe.promptCount,
          attemptedSamples: probe.attemptedCount,
          validSamples: probe.successfulCount,
        },
      })
    }
  } catch (err) {
    await writeDss({ sourceKey: 'ai_probe', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: errorReason(err) })
  }

  // —— site_audit：全站轻检不可变快照（含探针引用归属），findings 与 retest 的引用锚 ——
  if (crawlEnabled) {
    // 构建与落库同一 step（spec S1 §7，修 D8）：大载荷不跨 step 边界，只回传证据引用与体积。
    // 快照与图谱只用本 run 见过的页（修 D4）；模板代表页仍按项目全量查 URL（代表页可能不在本 run）。
    await step.run('build-site-audit-v2', async () => {
      await assertNotCancelled()
      const [pages, allPages, templates, probeResults] = await Promise.all([
        deps.getRunSitePages(projectId, runId),
        deps.getSitePages(projectId),
        deps.getProjectTemplates(projectId),
        deps.getRunProbeResults(runId),
      ])
      const pageById = new Map(allPages.map((p) => [p.id, p]))
      const linkGraph = buildLinkGraph({ entryUrl: entrySeed, pages: pages.map(toGraphInput) })
      const auditPayload = buildSiteAudit({
        pages: pages.map((p): SiteAuditPage => ({
          url: p.url, discoveredVia: p.discoveredVia, depth: p.depth, httpStatus: p.httpStatus,
          finalUrl: p.finalUrl, title: p.title, canonicalUrl: p.canonicalUrl, metaRobots: p.metaRobots,
          mainTextChars: p.mainTextChars, inboundLinkCount: p.inboundLinkCount,
          internalLinks: p.internalLinks,
          checkStatus: p.checkStatus, errorReason: p.errorReason, isKeyPage: p.isKeyPage,
          contentHash: p.contentHash, templateId: p.templateId,
          lightCheckExtra: p.lightCheckExtra as LightCheckExtra | null,
        })),
        templates: templates.map((t) => ({
          pattern: t.pattern,
          pageCount: t.pageCount,
          representativeUrl: t.representativePageId ? pageById.get(t.representativePageId)?.url ?? null : null,
        })),
        citedUrls: probeResults.flatMap((r) => r.citedUrls),
        entryHost: domain,
        maxPages,
        maxDepth,
        linkGraph,
        crawlStrategy: CRAWL_STRATEGY,
        sitemapReserveRatio: SITEMAP_RESERVE_RATIO,
        externalChecks,
        externalCheckProtocol,
      })
      const rawText = JSON.stringify(auditPayload)
      const evidenceId = `ev_${crypto.randomUUID()}`
      await deps.createEvidenceArtifact({
        id: evidenceId, projectId, runId, type: 'site_audit', claimLevel: 'L4',
        source: entryUrl,
        payload: auditPayload,
        rawText, rawHash: sha256Hex(rawText),
      })
      return { evidenceId, payloadBytes: Buffer.byteLength(rawText, 'utf8') }
    })
    await emit({ type: 'evidence_created', evidenceType: 'site_audit' })
  }

  // —— DataForSEO 采集（Phase C → SP-A §4.2）——：种子词 SERP→候选竞品→Labs→Backlinks→Bing→品牌 SERP，
  // 五个子阶段各写 dataforseo:<子阶段> 状态，父级按子阶段汇总（不再无条件记 collected）。
  // BYOK：无凭据整块跳过；种子为空时只跳过 seed_serp / labs（no_seeds）。竞品仅落 candidate，
  // 人工确认后由 reevaluateCompetitors 增量算 gap 与对比（两段式诊断，spec §5.1-4）。
  const dfs = await deps.resolveDataforseo()
  if (dfs) {
    const brand = brandFromDomain(domain)
    // 种子词（SP-A §3.3）：用户目标词 → 本期 GSC → 历史 GSC → 站点关键短语；探针问句不再作为种子。
    const { seeds, market } = await step.run('dfs-gather-seeds', async () => {
      const project = await deps.getProject(projectId)
      const market = project?.market ?? ''
      // 同协议的体检沿用起点体检的种子词样本（spec 2026-10-09 §5.3，与探针问句、AI 概览关键词同一原则）：
      // 否则 GSC / 历史词 / 页面标题一变就换一批词，种子类规则（K03、K04、K07、Q01、Q03）的「没了 / 已修复 /
      // 部分改善」可能只是样本变了。两边协议指纹都有且相同才沿用；起点没记种子 → 照常重新采样。
      if (baselineRunId) {
        const [self, anchor] = await Promise.all([deps.getRun(runId), deps.getRun(baselineRunId)])
        if (self?.protocolHash && anchor?.protocolHash && self.protocolHash === anchor.protocolHash) {
          const reused = recordedSeeds(await deps.getRunSeedSerpRequests(baselineRunId))
          if (reused) return { seeds: reused, market }
        }
      }
      const [manual, history, runPages] = await Promise.all([
        deps.getTargetKeywords(projectId),
        deps.getGscKeywordHistory(projectId),
        deps.getRunSitePages(projectId, runId),
      ])
      const current = new Set(gscTopQueries.map((q) => q.keyText.trim().toLowerCase()))
      const titles = runPages
        .filter((p) => p.checkStatus === 'checked' && p.httpStatus === 200 && p.title && !isUtilityPage(p.finalUrl ?? p.url))
        .map((p) => p.title as string)
      const entryH1 = extractSitePreviewFacts(pageFacts.rawHtml).h1
      const aliases = settings?.brandAliases ?? []
      const seeds = gatherSeedKeywords({
        manualKeywords: manual,
        gscQueries: gscTopQueries,
        historicalGsc: history.filter((h) => !current.has(h.keyText.trim().toLowerCase())),
        sitePhrases: sitePhrases({ titles, h1s: [...(entryH1 ? [entryH1] : []), ...deepH1s], brand, aliases }),
        brand,
        aliases,
        limit: settings?.seedKeywordLimit ?? 100,
      })
      return { seeds, market }
    })
    const outcomes = await deps.runDataforseo({
      step,
      emit,
      runId,
      projectId,
      domain,
      brand,
      market,
      seeds,
      competitorTopN: settings?.competitorSerpTopN ?? 10,
      provider: dfs.provider,
      drainRaws: dfs.drainRaws,
      persistRaws: (stage, raws) => Promise.all(raws.map((raw) => persistRawRow(subSourceKey('dataforseo', stage), raw))),
    })
    for (const o of outcomes) {
      const attempted = o.status !== 'not_attempted' && o.status !== 'not_configured'
      await writeDss({
        sourceKey: subSourceKey('dataforseo', o.stage), configured: true, authorized: true, attempted, status: o.status,
        capturedEvidenceCount: o.evidenceCount,
        // 失败/部分成功的原因写 failureReason；未尝试或"成功但无数据"的说明写 protocolSnapshot.reason。
        ...(o.reason && (o.status === 'failed' || o.status === 'partial') ? { failureReason: o.reason } : {}),
        ...(o.reason && o.status !== 'failed' && o.status !== 'partial' ? { protocolSnapshot: { reason: o.reason } } : {}),
      })
    }
    const parentStatus = aggregateParentStatus(outcomes.map((o) => o.status))
    await writeDss({
      sourceKey: 'dataforseo', configured: true, authorized: true,
      attempted: outcomes.some((o) => o.status !== 'not_attempted' && o.status !== 'not_configured'),
      status: parentStatus,
      capturedEvidenceCount: outcomes.reduce((sum, o) => sum + o.evidenceCount, 0),
      // 父级失败时写明各子阶段原因（与第三方 / 社媒父级同一格式）——报告按父级展示，不能只剩一个"失败"。
      ...(parentStatus === 'failed'
        ? { failureReason: outcomes.filter((o) => o.status !== 'collected').map((o) => `${o.stage}=${o.reason ?? o.status}`).join(', ') }
        : {}),
    })
  } else {
    await writeDss({ sourceKey: 'dataforseo', configured: false, authorized: false, attempted: false, status: 'not_configured' })
  }

  // —— Google AI Overviews 实测采集（AIO，分引擎双口径的实测半边）——
  // BYOK（DATAFORSEO_LOGIN/PASSWORD，走 resolveAioProvider DB>env）+ run 勾选 'Google AI
  // Overviews' 时才执行；否则整块跳过，不抛错（lib/probes/run-probes.ts:8-9 的边界延伸到这
  // 里——AIO 走独立采集 stage，不伪装成 AiProbeProvider，也不依赖 collectProbesStage 是否已
  // 建 prompts 行，见下方 buildPromptSetV2 直接构造查询词）。
  // 查询集：复用同一份确定性 30 条 prompt 文本（buildPromptSetV2）作为搜索 keyword，保证与
  // AI 探针同协议、可回测；每 run 每查询 1 次（n=1，V0 先测通，重复采样留待下轮）。
  // market 映射不到 location/language 时明确跳过（不猜一个默认国家），市场真源见 lib/markets.ts。
  const aioProvider = deps.resolveAioProvider ? await deps.resolveAioProvider() : deps.aioProvider
  const aioEngineSelected = (settings?.defaultModels ?? []).includes('Google AI Overviews')
  if (aioProvider.isConfigured() && aioEngineSelected) {
    const { aioQueries, market, baselineLoc } = await step.run('aio-gather-queries', async () => {
      // brandAliases 复用外层已取的 settings（load-crawl-settings 那次调用），不重复查询项目设置。
      const project = await deps.getProject(projectId)
      // 同协议回测（第二波审查 I4）：基线跑过 AIO → 原样复测它实际查过的关键词与地区（项目市场之后改了也不跟着变）；
      // 基线没跑 AIO 但有问句 → 复用问句集（第一波审查 I4）；都没有时才按当前项目新建。
      if (baselineRunId) {
        const baselineAio = await deps.getRunSerpAioResults(baselineRunId)
        if (baselineAio.length > 0) {
          const first = baselineAio[0]
          return {
            aioQueries: [...new Set(baselineAio.map((r) => r.keyword))],
            market: project?.market ?? '',
            baselineLoc: { locationCode: first.locationCode, languageCode: first.languageCode },
          }
        }
      }
      const baselinePrompts = baselineRunId ? await deps.getRunPrompts(baselineRunId) : []
      if (baselinePrompts.length > 0) return { aioQueries: baselinePrompts.map((p) => p.text), market: project?.market ?? '', baselineLoc: null }
      const queries = project
        ? buildPromptSetV2({
            domain: project.domain,
            industry: project.industry,
            market: project.market,
            language: project.language || 'en',
            competitors: project.competitors ?? [],
            aliases: settings?.brandAliases ?? [],
          }).map((p) => p.text)
        : []
      return { aioQueries: queries, market: project?.market ?? '', baselineLoc: null }
    })
    const aioMarket = findMarket(market)
    const loc = baselineLoc ?? (aioMarket ? { locationCode: aioMarket.locationCode, languageCode: aioMarket.languageCode } : null)
    if (!loc) {
      // 市场未在 AIO 显式映射表命中（如"东南亚"横跨多国）：不猜默认国家，整块标记未尝试。
      await writeDss({
        sourceKey: 'aio', configured: true, authorized: true, attempted: false, status: 'not_attempted',
        protocolSnapshot: { reason: 'market_not_mapped', market },
      })
    } else {
      let succeeded = 0
      for (const [i, keyword] of aioQueries.entries()) {
        try {
          const outcome = await step.run(`aio-query:${i}`, async () => {
            const runAt = new Date().toISOString()
            try {
              const raw = await aioProvider.fetchAioForKeyword(keyword, loc)
              const parsed = parseAioResult({ aioPresent: raw.aioPresent, references: raw.references, domain })
              const rawText = JSON.stringify(raw)
              const rawHash = sha256Hex(rawText)
              const evidenceId = `ev_${crypto.randomUUID()}`
              await deps.createEvidenceArtifact({
                id: evidenceId, projectId, runId, type: 'serp_aio', claimLevel: 'L3', source: 'dataforseo',
                request: {
                  keyword, locationCode: loc.locationCode, languageCode: loc.languageCode,
                  endpoint: '/v3/serp/google/organic/live/advanced', params: { load_async_ai_overview: true },
                  runAt, requestHash: sha256Hex(`${keyword}|${loc.locationCode}|${loc.languageCode}`),
                },
                payload: raw,
                rawText, rawHash,
              })
              await deps.createSerpAioResult({
                id: `saio_${crypto.randomUUID()}`, runId, evidenceId, keyword,
                locationCode: loc.locationCode, languageCode: loc.languageCode,
                aioPresent: parsed.aioPresent, targetDomainCited: parsed.targetDomainCited, citedUrls: parsed.citedUrls,
                rawAnswerHash: rawHash, parserVersion: AIO_PARSER_VERSION,
              })
              return { ok: true }
            } catch (err) {
              // 单查询失败留协议现场（error_code），不写 serp_aio_results；不阻断其余查询。
              const message = errorReason(err)
              await deps.createEvidenceArtifact({
                id: `ev_${crypto.randomUUID()}`, projectId, runId, type: 'serp_aio', claimLevel: 'L3', source: 'dataforseo',
                request: {
                  keyword, locationCode: loc.locationCode, languageCode: loc.languageCode,
                  endpoint: '/v3/serp/google/organic/live/advanced', params: { load_async_ai_overview: true },
                  runAt, error_code: message,
                },
                payload: null,
                rawText: '', rawHash: sha256Hex(''),
              })
              return { ok: false }
            }
          })
          if (outcome.ok) succeeded++
        } catch {
          // step 自身抛出（重试耗尽）：跳过该查询，其余继续。
        }
        await emit({ type: 'evidence_created', evidenceType: 'serp_aio' })
      }
      await writeDss({
        sourceKey: 'aio', configured: true, authorized: true, attempted: true,
        status: succeeded === 0 ? 'failed' : succeeded < aioQueries.length ? 'partial' : 'collected',
        capturedEvidenceCount: succeeded,
        failureReason: succeeded === 0 ? 'no_valid_aio_results' : null,
        protocolSnapshot: { market, locationCode: loc.locationCode, languageCode: loc.languageCode, queryCount: aioQueries.length, succeeded },
      })
    }
  } else {
    await writeDss({
      sourceKey: 'aio',
      configured: aioProvider.isConfigured(),
      authorized: aioProvider.isConfigured(),
      attempted: false,
      status: aioProvider.isConfigured() ? 'not_attempted' : 'not_configured',
    })
  }

  // —— GEO 深化采集（Phase D）——：AI 爬虫可达性 + llms.txt（G02/G08）+ 第三方语料（G07）。
  // 免 key、best-effort：各自 try/catch 降级，单点失败不阻断诊断触发；缺证据时对应规则 no-op。
  try {
    const uaProbe = await step.run('ua-probe', () => deps.collectUaProbe({ entryUrl }))
    if (uaProbe.crawlers.length > 0 && uaProbe.crawlers.every((c) => c.status === null)) {
      // 每个请求都失败（状态全为 null）：什么也没测到——记失败、不写证据（第二波审查 I2）。
      await writeDss({ sourceKey: 'ua_probe', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: 'all_requests_failed' })
    } else {
      const uaRaw = JSON.stringify(uaProbe)
      await step.run('persist-ua-probe', () =>
        deps.createEvidenceArtifact({
          id: `ev_${crypto.randomUUID()}`,
          projectId,
          runId,
          type: 'ua_probe',
          // 各爬虫 UA 实测状态码 + llms.txt 存在性均为硬事实（L4）。
          claimLevel: 'L4',
          source: entryUrl,
          payload: uaProbe,
          rawText: uaRaw,
          rawHash: sha256Hex(uaRaw),
        }),
      )
      await emit({ type: 'evidence_created', evidenceType: 'ua_probe' })
      await writeDss({ sourceKey: 'ua_probe', configured: true, authorized: true, attempted: true, status: 'collected', capturedEvidenceCount: 1 })
    }
  } catch {
    // UA 探测失败仅降级，G02/G08 no-op。
    await writeDss({ sourceKey: 'ua_probe', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: 'ua_probe_failed' })
  }

  // —— 第三方语料（G07，SP-A §4.4）——：维基同名词条 / Reddit 两路各记子阶段状态，原文存档；
  // 两路都失败不写证据（G07 无从判定），否则写 v2 证据（失败的一路在载荷里如实标 failed）。
  try {
    const brand = brandFromDomain(domain)
    const tp = await step.run('third-party-presence', async () => {
      const outcome = await deps.checkThirdPartyPresence({ brand, aliases: settings?.brandAliases ?? [] })
      const rawIds: string[] = []
      for (const { source, raw } of outcome.raws) rawIds.push(await persistRawRow(subSourceKey('third_party', source), raw))
      return { payload: outcome.payload, rawIds }
    })
    const { wikipedia, reddit } = tp.payload
    const childStatus = (c: { status: 'ok' | 'failed' }): DataSourceStatus => (c.status === 'ok' ? 'collected' : 'failed')
    for (const [child, check] of [['wikipedia', wikipedia], ['reddit', reddit]] as const) {
      await writeDss({
        sourceKey: subSourceKey('third_party', child), configured: true, authorized: true, attempted: true,
        status: childStatus(check), ...(check.status === 'failed' ? { failureReason: check.reason } : { capturedEvidenceCount: 1 }),
      })
    }
    if (wikipedia.status === 'failed' && reddit.status === 'failed') {
      await writeDss({
        sourceKey: 'third_party', configured: true, authorized: true, attempted: true, status: 'failed',
        failureReason: `wikipedia=${wikipedia.reason}, reddit=${reddit.reason}`,
      })
    } else {
      const tpRaw = JSON.stringify(tp.payload)
      await step.run('persist-third-party', async () => {
        const id = `ev_${crypto.randomUUID()}`
        await deps.createEvidenceArtifact({
          id,
          projectId,
          runId,
          type: 'third_party_presence',
          // Wikipedia 存在性偏硬、Reddit 提及数为估算——整体按第三方估算 L3。
          claimLevel: 'L3',
          source: brand,
          payload: tp.payload,
          rawText: tpRaw,
          rawHash: sha256Hex(tpRaw),
        })
        await deps.linkEvidenceRaw(tp.rawIds, id)
      })
      await emit({ type: 'evidence_created', evidenceType: 'third_party_presence' })
      await writeDss({
        sourceKey: 'third_party', configured: true, authorized: true, attempted: true,
        status: aggregateParentStatus([childStatus(wikipedia), childStatus(reddit)]), capturedEvidenceCount: 1,
      })
    }
  } catch {
    // 采集器自身不抛错；这里兜存档/落库等意外异常——第三方语料只降级，G07 no-op。
    await writeDss({ sourceKey: 'third_party', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: 'unexpected_error' })
  }

  // 社交/评价站前台存在度（YouTube/G2/Trustpilot/Capterra）：复用同一 Google CSE 通道，
  // 门控与 serp_snapshot 一致——未配置则跳过；已配置但采集失败仅降级，不阻断整轮。
  // 各平台独立判定成败（SP-A §4.4）：子阶段 social_presence:<平台> 各记状态，原文存档；
  // 四个平台全部失败不写证据，否则写证据（失败平台在载荷里标 failed），父级状态按子阶段汇总。
  if (cseConfigured) {
    try {
      const brand = brandFromDomain(domain)
      const sp = await step.run('social-presence', async () => {
        const outcome = await deps.checkSocialPresence({ brand }, (query) => deps.searchVisibilityProvider.search(query))
        const rawIds: string[] = []
        for (const { platform, raw } of outcome.raws) rawIds.push(await persistRawRow(subSourceKey('social_presence', platform), raw))
        return { payload: outcome.payload, rawIds }
      })
      const childStatuses: DataSourceStatus[] = []
      for (const p of sp.payload.platforms) {
        const status: DataSourceStatus = p.status === 'ok' ? 'collected' : 'failed'
        childStatuses.push(status)
        await writeDss({
          sourceKey: subSourceKey('social_presence', p.platform), configured: true, authorized: true, attempted: true, status,
          ...(p.status === 'ok' ? { capturedEvidenceCount: 1 } : { failureReason: p.reason ?? 'unknown' }),
        })
      }
      if (childStatuses.every((s) => s === 'failed')) {
        await writeDss({
          sourceKey: 'social_presence', configured: true, authorized: true, attempted: true, status: 'failed',
          failureReason: sp.payload.platforms.map((p) => `${p.platform}=${p.reason ?? 'unknown'}`).join(', '),
        })
      } else {
        const spRaw = JSON.stringify(sp.payload)
        await step.run('persist-social-presence', async () => {
          const id = `ev_${crypto.randomUUID()}`
          await deps.createEvidenceArtifact({
            id,
            projectId,
            runId,
            type: 'social_presence',
            // CSE 前台可见性口径，对齐 serp_snapshot 判例——L2。
            claimLevel: 'L2',
            source: brand,
            payload: sp.payload,
            rawText: spRaw,
            rawHash: sha256Hex(spRaw),
          })
          await deps.linkEvidenceRaw(sp.rawIds, id)
        })
        await emit({ type: 'evidence_created', evidenceType: 'social_presence' })
        await writeDss({
          sourceKey: 'social_presence', configured: true, authorized: true, attempted: true,
          status: aggregateParentStatus(childStatuses), capturedEvidenceCount: 1,
        })
      }
    } catch {
      // 采集器自身不抛错；这里兜存档/落库等意外异常——社媒存在度只降级，不阻断整轮。
      await writeDss({ sourceKey: 'social_presence', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: 'unexpected_error' })
    }
  } else {
    await writeDss({ sourceKey: 'social_presence', configured: false, authorized: false, attempted: false, status: 'not_configured' })
  }

  await emit({ type: 'progress', pct: 90 })

  await step.run('mark-collected', () =>
    deps.markRunStatus(runId, 'collected', { finishedAt: new Date().toISOString(), failureReason: null }),
  )
  // 链接诊断生成链：采集落地后立即触发 generateFindings（独立 Inngest 函数，异步接力）。
  // 回测锚点穿线：baselineRunId 非空则 generateFindings 收尾算 delta（spec §5.1-3）。
  await step.run('trigger-diagnose', () => deps.sendDiagnose({ runId, projectId, baselineRunId }))
  await emit({ type: 'done' })

  return { status: 'collected' }
}

export const collectEvidence = inngest.createFunction(
  {
    id: 'collect-evidence',
    retries: 3,
    onFailure: async (ctx) => {
      const original = (ctx.event.data as { event: { data: CollectRequestedEventData } }).event
      const runId = original.data.runId
      const failure = ctx as { error?: Error; event: { data: { error?: { message?: string } } } }
      const reason = errorReason(failure.error ?? failure.event.data.error, 'collection_failed')
      await markRunStatus(runId, 'failed', { failureReason: reason, finishedAt: new Date().toISOString() })
      try { await (await import('@/lib/knowledge/repository')).failWorkflowForRun(runId, reason) } catch { /* migration compatibility */ }
      // 重试耗尽的失败（非 SSRF 分支）此前只落 DB 不广播，SSE 消费者拿不到终止帧。
      // 这里补发 failed，让 /runs/{id}/events 的流能收到终态并关闭。
      const publish = (ctx as { publish?: (m: unknown) => Promise<void> }).publish
      try {
        if (publish) await publish(await runProgressChannel(runId).progress({ type: 'failed', reason }))
      } catch {
        // publish 在失败上下文不可用时忽略——DB 状态已是 failed，SSE 路由的终态短路也会兜底。
      }
    },
  },
  { event: COLLECT_REQUESTED_EVENT },
  // Inngest 运行时 ctx 的 event/step/publish 类型比 handler 的 CollectArgs 宽（event.data
  // 是未定 schema 的 union，step.run 返回 Jsonify 变换类型）。handler 是刻意解耦、已单测的纯
  // 逻辑接缝，这里在薄封装边界把 ctx 收窄成它期望的形状。
  (ctx) => collectEvidenceHandler(ctx as unknown as Parameters<typeof collectEvidenceHandler>[0]),
)
