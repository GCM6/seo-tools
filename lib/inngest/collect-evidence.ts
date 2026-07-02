import { NonRetriableError } from 'inngest'
import { inngest } from './client'
import { COLLECT_REQUESTED_EVENT, type CollectRequestedEventData } from './events'
import { runProgressChannel, type RunProgressMessage } from './channels'
import { assertPublicUrl, SsrfBlockedError } from '@/lib/security/ssrf-guard'
import { fetchPageFacts } from '@/lib/collection/page-parser'
import { fetchRobotsCheck } from '@/lib/collection/robots'
import { extractSchema } from '@/lib/collection/schema-extractor'
import { computeMainContentDelta } from '@/lib/collection/readability-risk'
import { sha256Hex } from '@/lib/collection/hash'
import { normalizeUrl } from '@/lib/crawl/url'
import { discoverSitemaps } from '@/lib/crawl/sitemap'
import { createCrawlState, runCrawlBatch, leftoverDiscovered, type CrawlPageResult } from '@/lib/crawl/crawler'
import { planTemplates } from '@/lib/crawl/template-cluster'
import { buildSiteAudit, type SiteAuditPage } from '@/lib/crawl/site-audit'
import { createCloudflareRenderProvider } from '@/lib/render/cloudflare-provider'
import type { RenderProvider } from '@/lib/render/render-provider'
import { createGoogleCseSearchVisibilityProvider, type SearchVisibilityProvider } from '@/lib/search/search-visibility-provider'
import { collectProbesStage } from '@/lib/probes/run-probes'
import { buildProbeProvidersFromEnv } from '@/lib/probes/providers'
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
    createEvidenceArtifact,
    markRunStatus,
    runProbes: (args) =>
      collectProbesStage(args, {
        getProject,
        getProjectSettings,
        buildProviders: buildProbeProvidersFromEnv,
        createPrompts,
        createEvidenceArtifact,
        createAiProbeResult,
      }),
    getProjectSettings,
    discoverSitemaps,
    runCrawlBatch,
    upsertSitePages,
    getSitePages,
    updateInboundCounts,
    syncUrlTemplates,
    getProjectTemplates,
    getRunProbeResults,
  }
}

export async function collectEvidenceHandler(
  { event, step, publish }: CollectArgs,
  deps: CollectDeps = defaultDeps(),
): Promise<{ status: 'collected' }> {
  const { runId, projectId, url } = event.data
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
      payload: { canonicalUrl: pageFacts.canonicalUrl, metaRobots: pageFacts.metaRobots, robotsAllowed: robots.allowed },
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
      payload: { types: schema.types },
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
            checkStatus: 'discovered_only' as const, errorReason: null,
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
        payload: { types: deepSchema.types },
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

  await emit({ type: 'progress', pct: 90 })

  await step.run('mark-collected', () =>
    deps.markRunStatus(runId, 'collected', { finishedAt: new Date().toISOString(), failureReason: null }),
  )
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
