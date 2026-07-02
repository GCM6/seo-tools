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

  // AI 探针（20 prompts × provider × n）：进度在 65→90 区间由 stage 自行推进
  await deps.runProbes({ step, emit, runId, projectId, entryUrl })

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
