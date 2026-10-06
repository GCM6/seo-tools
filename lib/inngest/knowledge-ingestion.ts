import { inngest } from './client'
import { ingestKnowledgeSource } from '@/lib/knowledge/ingestion'
import { ensureBootstrapReleases, listKnowledgeSources, seedKnowledgeSources } from '@/lib/knowledge/repository'

async function initializedSources() {
  await seedKnowledgeSources()
  await ensureBootstrapReleases()
  return listKnowledgeSources()
}

export const googleKnowledgeIngestion = inngest.createFunction(
  { id: 'google-knowledge-ingestion', retries: 3 },
  { cron: 'TZ=Asia/Shanghai 0 6 * * *' },
  async ({ step }) => {
    const sources = await step.run('load-google-knowledge-sources', async () =>
      (await initializedSources()).filter((source) => source.enabled && source.sourceType.startsWith('google')),
    )
    const results: unknown[] = []
    // Google 官方源最多 3 个，显式并发且低于约定上限 4。
    for (let index = 0; index < sources.length; index += 4) {
      const batch = sources.slice(index, index + 4)
      results.push(...await Promise.all(batch.map((source) => step.run(
        `ingest-${source.id}`,
        () => ingestKnowledgeSource({ sourceId: source.id, trigger: 'scheduled' }),
      ))))
    }
    return { sources: sources.length, results }
  },
)

export const redditKnowledgeIngestion = inngest.createFunction(
  { id: 'reddit-knowledge-ingestion', retries: 3 },
  { cron: 'TZ=Asia/Shanghai 30 6 * * *' },
  async ({ step }) => {
    const sources = await step.run('load-reddit-knowledge-sources', async () =>
      (await initializedSources()).filter((source) => source.enabled && source.sourceType.startsWith('reddit')),
    )
    await step.sendEvent('fan-out-reddit-sources', sources.map((source) => ({
      name: 'veris/knowledge.ingest.requested',
      data: { sourceId: source.id, backfill: false },
    })))
    return { sources: sources.length, dispatched: sources.length }
  },
)

export const redditActiveThreadRefresh = inngest.createFunction(
  { id: 'reddit-active-thread-refresh', retries: 3, concurrency: { limit: 1 } },
  { cron: 'TZ=Asia/Shanghai 0 7 * * 1' },
  async ({ step }) => {
    const sources = await step.run('load-active-reddit-sources', async () =>
      (await initializedSources()).filter((source) => source.enabled && source.sourceType.startsWith('reddit')),
    )
    await step.sendEvent('fan-out-active-thread-refresh', sources.map((source) => ({
      name: 'veris/knowledge.ingest.requested',
      data: { sourceId: source.id, retry: true },
    })))
    return { sources: sources.length, dispatched: sources.length }
  },
)

export const manualKnowledgeIngestion = inngest.createFunction(
  { id: 'manual-knowledge-ingestion', retries: 2, concurrency: { limit: 1, key: 'event.data.sourceId' } },
  { event: 'veris/knowledge.ingest.requested' },
  async ({ event, step }) => step.run('ingest-source', () => ingestKnowledgeSource({
    sourceId: String(event.data.sourceId),
    trigger: event.data.backfill ? 'backfill' : event.data.retry ? 'retry' : 'manual',
    provider: event.data.provider,
  })),
)
