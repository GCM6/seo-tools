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
import { createEvidenceArtifact, markRunStatus } from '@/lib/repositories'

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
  createEvidenceArtifact: typeof createEvidenceArtifact
  markRunStatus: typeof markRunStatus
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
    createEvidenceArtifact,
    markRunStatus,
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

  let validUrl: URL
  try {
    validUrl = await step.run('validate-url', () => deps.assertPublicUrl(url))
  } catch (err) {
    await step.run('mark-failed-ssrf', () => deps.markRunStatus(runId, 'failed'))
    const reason = err instanceof Error ? err.message : 'invalid_url'
    await emit({ type: 'failed', reason })
    if (err instanceof SsrfBlockedError) throw new NonRetriableError(reason)
    throw err
  }
  const entryUrl = validUrl.toString()
  await emit({ type: 'progress', pct: 10 })

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
  await emit({ type: 'progress', pct: 40 })

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
  await emit({ type: 'progress', pct: 60 })

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
  await emit({ type: 'progress', pct: 90 })

  await step.run('mark-collected', () => deps.markRunStatus(runId, 'collected', { finishedAt: new Date().toISOString() }))
  await emit({ type: 'done' })

  return { status: 'collected' }
}

export const collectEvidence = inngest.createFunction(
  {
    id: 'collect-evidence',
    retries: 3,
    onFailure: async ({ event }) => {
      const original = (event.data as { event: { data: CollectRequestedEventData } }).event
      await markRunStatus(original.data.runId, 'failed')
    },
  },
  { event: COLLECT_REQUESTED_EVENT },
  // Inngest 运行时 ctx 的 event/step/publish 类型比 handler 的 CollectArgs 宽（event.data
  // 是未定 schema 的 union，step.run 返回 Jsonify 变换类型）。handler 是刻意解耦、已单测的纯
  // 逻辑接缝，这里在薄封装边界把 ctx 收窄成它期望的形状。
  (ctx) => collectEvidenceHandler(ctx as unknown as Parameters<typeof collectEvidenceHandler>[0]),
)
