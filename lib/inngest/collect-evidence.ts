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
import { refreshAccessToken } from '@/lib/gsc/oauth'
import { querySearchAnalytics, mapRowsToKeywordMetrics } from '@/lib/gsc/search-analytics'
import { impressionWeightedAvgPosition } from '@/lib/gsc/avg-position'
import { createDataforseoProviderFromEnv, isDataforseoConfigured } from '@/lib/dataforseo'
import { collectDataforseoStage, type DataforseoStageArgs } from '@/lib/dataforseo/collect-stage'
import type { DataforseoProvider } from '@/lib/dataforseo/types'
import { gatherSeedKeywords } from '@/lib/diagnosis/seed-keywords'
import { brandFromDomain } from '@/lib/probes/prompt-set'
import { sha256Hex } from '@/lib/collection/hash'
import { normalizeUrl } from '@/lib/crawl/url'
import { discoverSitemaps } from '@/lib/crawl/sitemap'
import { createCrawlState, runCrawlBatch, leftoverDiscovered, type CrawlPageResult } from '@/lib/crawl/crawler'
import type { LightCheckExtra } from '@/lib/crawl/light-check'
import { planTemplates } from '@/lib/crawl/template-cluster'
import { buildSiteAudit, type SiteAuditPage } from '@/lib/crawl/site-audit'
import { createCloudflareRenderProvider } from '@/lib/render/cloudflare-provider'
import type { RenderProvider } from '@/lib/render/render-provider'
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
  upsertSitePages,
  getSitePages,
  updateInboundCounts,
  syncUrlTemplates,
  getProjectTemplates,
  getRunProbeResults,
  getRunPrompts,
  upsertKeyword,
  createKeywordMetrics,
  upsertCompetitor,
} from '@/lib/repositories'

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
  searchVisibilityProvider: SearchVisibilityProvider
  // PSI 性能采集（T09a-c 证据源）。免 key 可用；失败降级不阻断整轮采集。
  fetchPageSpeedInsights: typeof fetchPageSpeedInsights
  isPsiConfigured: typeof isPsiConfigured
  // GEO 深化采集（Phase D）：AI 爬虫可达性/llms.txt（G02/G08）+ 第三方语料（G07）。免 key，best-effort。
  collectUaProbe: typeof collectUaProbe
  checkThirdPartyPresence: typeof checkThirdPartyPresence
  // GSC 关键词采集（K 组证据源）。仅在项目已连接 OAuth 时触发；失败降级不阻断。
  refreshGscAccessToken: (refreshToken: string) => Promise<{ accessToken: string }>
  querySearchAnalytics: typeof querySearchAnalytics
  upsertKeyword: typeof upsertKeyword
  createKeywordMetrics: typeof createKeywordMetrics
  // DataForSEO 采集（Phase C，P3 缺口/P4 竞品/P5 外链证据源）。BYOK，未配置时整块跳过。
  isDataforseoConfigured: typeof isDataforseoConfigured
  dataforseoProvider: DataforseoProvider
  runDataforseo: (args: DataforseoStageArgs) => Promise<void>
  getRunPrompts: typeof getRunPrompts
  getProject: typeof getProject
  createEvidenceArtifact: typeof createEvidenceArtifact
  markRunStatus: typeof markRunStatus
  // AI 探针阶段整体注入：provider/key 过滤与失败兜底都在 stage 内部
  runProbes: (args: Parameters<typeof collectProbesStage>[0]) => ReturnType<typeof collectProbesStage>
  // 全站路由发现（spec: 2026-07-02-site-route-discovery）
  getProjectSettings: typeof getProjectSettings
  discoverSitemaps: typeof discoverSitemaps
  runCrawlBatch: typeof runCrawlBatch
  upsertSitePages: typeof upsertSitePages
  getSitePages: typeof getSitePages
  updateInboundCounts: typeof updateInboundCounts
  syncUrlTemplates: typeof syncUrlTemplates
  getProjectTemplates: typeof getProjectTemplates
  getRunProbeResults: typeof getRunProbeResults
  // 采集完成后触发诊断生成链（spec §5）。注入以便单测无副作用地断言其被调用。
  sendDiagnose: (data: DiagnoseRequestedEventData) => Promise<unknown>
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

function defaultDeps(): CollectDeps {
  return {
    assertPublicUrl,
    fetchPageFacts,
    fetchRobotsCheck,
    extractSchema,
    renderProvider: createCloudflareRenderProvider({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
      apiToken: process.env.CLOUDFLARE_API_TOKEN ?? '',
    }),
    searchVisibilityProvider: createGoogleCseSearchVisibilityProvider({
      apiKey: process.env.GOOGLE_CSE_API_KEY ?? '',
      cx: process.env.GOOGLE_CSE_CX ?? '',
    }),
    fetchPageSpeedInsights,
    isPsiConfigured,
    collectUaProbe,
    checkThirdPartyPresence,
    refreshGscAccessToken: (refreshToken) => refreshAccessToken(refreshToken),
    querySearchAnalytics,
    upsertKeyword,
    createKeywordMetrics,
    isDataforseoConfigured,
    dataforseoProvider: createDataforseoProviderFromEnv(),
    runDataforseo: (args) => collectDataforseoStage(args, { createEvidenceArtifact, upsertCompetitor }),
    getRunPrompts,
    getProject,
    createEvidenceArtifact,
    markRunStatus,
    runProbes: async (args) => {
      // 探针 key 走 DB>env 解析（BYOK 设置页录入优先于环境变量）。
      const creds = await resolveCredentials(PROBE_CREDENTIAL_KEYS)
      return collectProbesStage(args, {
        getProject,
        getProjectSettings,
        buildProviders: () => buildProbeProviders(creds),
        createPrompts,
        createEvidenceArtifact,
        createAiProbeResult,
      })
    },
    getProjectSettings,
    discoverSitemaps,
    runCrawlBatch,
    upsertSitePages,
    getSitePages,
    updateInboundCounts,
    syncUrlTemplates,
    getProjectTemplates,
    getRunProbeResults,
    sendDiagnose: (data) => inngest.send(buildDiagnoseRequestedEvent(data)),
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

  if (deps.searchVisibilityProvider.isConfigured()) {
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
  const crawlEnabled = settings?.crawlEnabled ?? true
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
    let crawlState = createCrawlState(entrySeed, sitemaps.pageUrls, domain)
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
      lightCheckExtra: r.extra,
      checkStatus: r.checkStatus,
      errorReason: r.errorReason,
    })
    let batchIdx = 0
    const maxBatches = Math.ceil(maxPages / crawlOpts.batchSize) + 5 // 保险丝：防状态机 bug 造成死循环
    while (!crawlState.done && batchIdx < maxBatches) {
      const snapshot = crawlState
      const batch = await step.run(`crawl-batch-${batchIdx}`, () => deps.runCrawlBatch(snapshot, crawlOpts))
      crawlState = batch.state
      if (batch.results.length) {
        await step.run(`persist-crawl-batch-${batchIdx}`, () =>
          deps.upsertSitePages(projectId, runId, batch.results.map(toUpsert)),
        )
      }
      await emit({ type: 'phase', phase: 'light_check', checked: crawlState.checkedCount, total: maxPages })
      batchIdx++
    }
    const leftover = leftoverDiscovered(crawlState)
    if (leftover.length) {
      await step.run('persist-discovered-only', () =>
        deps.upsertSitePages(
          projectId,
          runId,
          leftover.map((l) => ({
            url: l.url, discoveredVia: l.via, depth: l.depth, httpStatus: null, finalUrl: null,
            title: null, canonicalUrl: null, metaRobots: null, mainTextChars: null, contentHash: null,
            lightCheckExtra: null, checkStatus: 'discovered_only' as const, errorReason: null,
          })),
        ),
      )
    }
    await step.run('update-inbound-counts', () => deps.updateInboundCounts(projectId, crawlState.inbound))

    await emit({ type: 'phase', phase: 'cluster' })
    await step.run('cluster-templates', async () => {
      const pages = await deps.getSitePages(projectId)
      const candidates = pages
        .filter((p) => p.checkStatus === 'checked')
        .map((p) => ({ url: p.url, mainTextChars: p.mainTextChars, httpStatus: p.httpStatus, checkStatus: p.checkStatus }))
      await deps.syncUrlTemplates(projectId, planTemplates(candidates, entrySeed))
    })
  }

  if (deps.renderProvider.isConfigured?.() ?? true) {
    const rendered = await step.run('render-check', () => deps.renderProvider.renderMainText(entryUrl))
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
  }

  // —— PSI 性能采集（T09a-c）——：入口页移动端 CWV 字段数据 + Lighthouse 实验室线索。
  // 免 key 可用；单次失败（配额/网络）不阻断采集，psi 证据缺失时 T09 规则整体 no-op。
  if (deps.isPsiConfigured()) {
    try {
      const psi = await step.run('fetch-psi', () => deps.fetchPageSpeedInsights(entryUrl, 'mobile'))
      const rawText = JSON.stringify(psi)
      await step.run('persist-psi', () =>
        deps.createEvidenceArtifact({
          id: `ev_${crypto.randomUUID()}`,
          projectId,
          runId,
          type: 'psi',
          // CrUX 字段数据为真实用户测量（L4）；Lighthouse 实验室部分在同一 artifact，规则按 hasFieldData 分级。
          claimLevel: 'L4',
          source: entryUrl,
          request: { strategy: 'mobile', note: 'CrUX field data = ranking signal (L4); Lighthouse lab = diagnostic only, not ranking input' },
          payload: psi,
          rawText,
          rawHash: sha256Hex(rawText),
        }),
      )
      await emit({ type: 'evidence_created', evidenceType: 'psi' })
    } catch {
      // PSI 失败仅降级，不影响其余证据与诊断触发。
    }
  }

  // GSC query 维 Top 展示词：作为 DataForSEO 种子词的真实需求来源（未连 GSC 时留空，种子仅来自探针）。
  let gscTopQueries: { keyText: string; impressions: number }[] = []

  // —— GSC 关键词采集（K 组）——：已连接 OAuth 的项目拉 query 维 + page×query 交叉维，
  // 落 gsc 证据（供规则）+ keyword_metrics（供关键词现状 tab 与回测）。未连接则整块跳过，K 组 no-op。
  const refreshToken = readGscToken(settings?.gscRefreshToken)
  if (settings?.gscConnected && refreshToken && settings.gscSiteUrl) {
    const siteUrl = settings.gscSiteUrl
    try {
      const gsc = await step.run('gsc-query', async () => {
        const { accessToken } = await deps.refreshGscAccessToken(refreshToken)
        const range = gscDateRange()
        const [queryRows, queryPageRows] = await Promise.all([
          deps.querySearchAnalytics(accessToken, siteUrl, { ...range, dimensions: ['query'], rowLimit: 1000 }),
          deps.querySearchAnalytics(accessToken, siteUrl, { ...range, dimensions: ['page', 'query'], rowLimit: 1000 }),
        ])
        return { queryRows, queryPageRows, range }
      })

      // 供 DataForSEO 种子词收集（按展示量取头部）。
      gscTopQueries = gsc.queryRows
        .filter((r) => r.keys[0])
        .map((r) => ({ keyText: r.keys[0], impressions: r.impressions }))

      // query 维证据：K01/K02 的取数锚。keyword_metrics 也引用它作 evidenceId。
      const queryEvId = `ev_${crypto.randomUUID()}`
      const avgPosition = impressionWeightedAvgPosition(gsc.queryRows)
      const queryRaw = JSON.stringify(gsc.queryRows)
      await step.run('persist-gsc-query', () =>
        deps.createEvidenceArtifact({
          id: queryEvId, projectId, runId, type: 'gsc', claimLevel: 'L4', source: siteUrl,
          request: { dimension: 'query', ...gsc.range },
          payload: { dimension: 'query', rows: gsc.queryRows, avgPosition },
          rawText: queryRaw, rawHash: sha256Hex(queryRaw),
        }),
      )

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
            id: `kw_${crypto.randomUUID()}`, projectId, text: m.keyText, market: '', language: '', source: 'gsc', intent: '',
          })
          metricRows.push({
            id: `km_${crypto.randomUUID()}`, runId, keywordId: kw.id, source: 'gsc',
            impressions: m.impressions, clicks: m.clicks, ctr: m.ctr, position: m.position, evidenceId: queryEvId,
          })
        }
        await deps.createKeywordMetrics(metricRows)
      })
      await emit({ type: 'evidence_created', evidenceType: 'gsc' })
    } catch {
      // GSC 失败（令牌过期/权限/网络）仅降级，不阻断采集与诊断。
    }
  }

  // —— 模板代表页 + 重点页深检：渲染调用数 = 模板数 + 重点页数，而非全站页数 ——
  async function deepCheckTarget(target: { url: string; sitePageId: string }) {
    const facts = await step.run(`deep-fetch:${target.url}`, () => deps.fetchPageFacts(target.url))
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
    if (deps.renderProvider.isConfigured?.() ?? true) {
      const deepRendered = await step.run(`deep-render:${target.url}`, () => deps.renderProvider.renderMainText(target.url))
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
  await deps.runProbes({ step, emit, runId, projectId, entryUrl })

  // —— site_audit：全站轻检不可变快照（含探针引用归属），findings 与 retest 的引用锚 ——
  if (crawlEnabled) {
    const auditPayload = await step.run('build-site-audit', async () => {
      const [pages, templates, probeResults] = await Promise.all([
        deps.getSitePages(projectId),
        deps.getProjectTemplates(projectId),
        deps.getRunProbeResults(runId),
      ])
      const pageById = new Map(pages.map((p) => [p.id, p]))
      return buildSiteAudit({
        pages: pages.map((p): SiteAuditPage => ({
          url: p.url, discoveredVia: p.discoveredVia, depth: p.depth, httpStatus: p.httpStatus,
          finalUrl: p.finalUrl, canonicalUrl: p.canonicalUrl, metaRobots: p.metaRobots,
          mainTextChars: p.mainTextChars, inboundLinkCount: p.inboundLinkCount,
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
      })
    })
    await step.run('persist-site-audit', () =>
      deps.createEvidenceArtifact({
        id: `ev_${crypto.randomUUID()}`, projectId, runId, type: 'site_audit', claimLevel: 'L4',
        source: entryUrl,
        payload: auditPayload,
        rawText: JSON.stringify(auditPayload), rawHash: sha256Hex(JSON.stringify(auditPayload)),
      }),
    )
    await emit({ type: 'evidence_created', evidenceType: 'site_audit' })
  }

  // —— DataForSEO 采集（Phase C）——：种子词 SERP→候选竞品→Labs→Backlinks→Bing→品牌 SERP。
  // BYOK：未配置则整块跳过；种子为空（无 GSC 且无探针词）时 stage 内部 no-op。竞品仅落 candidate，
  // 人工确认后由 reevaluateCompetitors 增量算 gap 与对比（两段式诊断，spec §5.1-4）。
  if (deps.isDataforseoConfigured()) {
    const brand = brandFromDomain(domain)
    const { seeds, market } = await step.run('dfs-gather-seeds', async () => {
      const [project, prompts] = await Promise.all([deps.getProject(projectId), deps.getRunPrompts(runId)])
      const seeds = gatherSeedKeywords({
        gscQueries: gscTopQueries,
        promptTexts: prompts.map((p) => p.text),
        brand,
        limit: settings?.seedKeywordLimit ?? 100,
      })
      return { seeds, market: project?.market ?? '' }
    })
    await deps.runDataforseo({
      step,
      emit,
      runId,
      projectId,
      domain,
      brand,
      market,
      seeds,
      competitorTopN: settings?.competitorSerpTopN ?? 10,
      provider: deps.dataforseoProvider,
    })
  }

  // —— GEO 深化采集（Phase D）——：AI 爬虫可达性 + llms.txt（G02/G08）+ 第三方语料（G07）。
  // 免 key、best-effort：各自 try/catch 降级，单点失败不阻断诊断触发；缺证据时对应规则 no-op。
  try {
    const uaProbe = await step.run('ua-probe', () => deps.collectUaProbe({ entryUrl }))
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
  } catch {
    // UA 探测失败仅降级，G02/G08 no-op。
  }

  try {
    const brand = brandFromDomain(domain)
    const thirdParty = await step.run('third-party-presence', () => deps.checkThirdPartyPresence({ brand }))
    const tpRaw = JSON.stringify(thirdParty)
    await step.run('persist-third-party', () =>
      deps.createEvidenceArtifact({
        id: `ev_${crypto.randomUUID()}`,
        projectId,
        runId,
        type: 'third_party_presence',
        // Wikipedia 存在性偏硬、Reddit 提及数为估算——整体按第三方估算 L3。
        claimLevel: 'L3',
        source: brand,
        payload: thirdParty,
        rawText: tpRaw,
        rawHash: sha256Hex(tpRaw),
      }),
    )
    await emit({ type: 'evidence_created', evidenceType: 'third_party_presence' })
  } catch {
    // 第三方语料检测失败仅降级，G07 no-op。
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
