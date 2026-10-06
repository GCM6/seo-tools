import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { knowledgeIngestRuns, knowledgeSources } from '@/db/schema'
import { collectGoogleFeed } from './collectors/google'
import { collectReddit } from './collectors/reddit'
import type { DistillationProvider } from './distillation'
import { distillStoredVersion, persistSourceCandidate, recomputeCommunityConsensus } from './repository'
import { R2ObjectStore, type RawObjectStore } from './storage'
import type { CoverageReport, SourceCandidate } from './types'

export async function ingestKnowledgeSource(input: {
  sourceId: string
  trigger?: 'scheduled' | 'manual' | 'backfill' | 'retry'
  provider?: DistillationProvider
  store?: RawObjectStore
}): Promise<{ ingestRunId: string; coverage: CoverageReport; claimsCreated: number }> {
  const source = await db.query.knowledgeSources.findFirst({ where: eq(knowledgeSources.id, input.sourceId) })
  if (!source || !source.enabled) throw new Error('knowledge_source_not_found_or_disabled')
  const ingestRunId = `ingest_${crypto.randomUUID()}`
  const trigger = input.trigger ?? 'manual'
  await db.insert(knowledgeIngestRuns).values({ id: ingestRunId, sourceId: source.id, trigger, status: 'running' })
  const coverage: CoverageReport = { requested: 0, fetched: 0, changed: 0, skipped: 0, failed: 0, inaccessibleReasons: [] }
  let claimsCreated = 0
  try {
    let candidates: SourceCandidate[] = []
    const config = source.config as Record<string, unknown>
    if (source.sourceType === 'google_docs' || source.sourceType === 'google_news') {
      candidates = await collectGoogleFeed(source.canonicalUrl, {
        since: trigger === 'backfill' ? new Date(Date.now() - 365 * 86_400_000) : undefined,
      })
    } else if (source.sourceType === 'reddit_community' || source.sourceType === 'reddit_search') {
      const reddit = await collectReddit({
        community: typeof config.community === 'string' ? config.community : undefined,
        query: typeof config.query === 'string' ? config.query : undefined,
        since: new Date(Date.now() - Number(config.backfillDays ?? 365) * 86_400_000),
        includeComments: config.includeComments !== false,
        maxPages: trigger === 'backfill' ? 10 : 2,
      })
      candidates = reddit.candidates
      coverage.earliestObservedAt = reddit.earliestObservedAt
      coverage.inaccessibleReasons.push(...reddit.inaccessibleReasons)
    } else {
      throw new Error('knowledge_source_collector_not_supported')
    }
    coverage.requested = candidates.length
    coverage.fetched = candidates.length
    const store = input.store ?? new R2ObjectStore()
    for (const candidate of candidates) {
      try {
        const persisted = await persistSourceCandidate({
          sourceId: source.id, sourceType: source.sourceType, ingestRunId, candidate, store,
        })
        if (!persisted.changed && !persisted.needsDistillation) {
          coverage.skipped++
          continue
        }
        if (persisted.changed) coverage.changed++
        claimsCreated += await distillStoredVersion(persisted.versionId, input.provider)
      } catch (error) {
        coverage.failed++
        coverage.inaccessibleReasons.push(error instanceof Error ? error.message : String(error))
      }
    }
    await recomputeCommunityConsensus()
    const status = coverage.failed === 0 ? 'completed' : coverage.changed > 0 ? 'partial' : 'failed'
    await db.update(knowledgeIngestRuns).set({
      status, finishedAt: new Date().toISOString(), fetchedCount: coverage.fetched, changedCount: coverage.changed,
      skippedCount: coverage.skipped, errorCount: coverage.failed, coverage: { ...coverage },
      errorSummary: coverage.inaccessibleReasons.slice(0, 20).join('\n') || null,
    }).where(eq(knowledgeIngestRuns.id, ingestRunId))
    await db.update(knowledgeSources).set({
      lastSuccessAt: status !== 'failed' ? new Date().toISOString() : source.lastSuccessAt,
      updatedAt: new Date().toISOString(),
    }).where(eq(knowledgeSources.id, source.id))
    return { ingestRunId, coverage, claimsCreated }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.update(knowledgeIngestRuns).set({ status: 'failed', finishedAt: new Date().toISOString(), errorCount: 1, errorSummary: message, coverage: { ...coverage } }).where(eq(knowledgeIngestRuns.id, ingestRunId))
    throw error
  }
}
