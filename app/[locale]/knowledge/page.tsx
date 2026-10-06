import { setRequestLocale } from 'next-intl/server'
import {
  ensureBootstrapReleases,
  latestKnowledgeRelease,
  latestRuleConfigRelease,
  latestWorkflowVersion,
  listClaimsForReview,
  listIngestRuns,
  listKnowledgeEntries,
  listKnowledgeSources,
  listWorkflowProposals,
  seedKnowledgeSources,
} from '@/lib/knowledge/repository'
import { KnowledgeBrainClient } from './KnowledgeBrainClient'

export default async function KnowledgePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  await seedKnowledgeSources()
  await ensureBootstrapReleases()
  const [sources, runs, claims, entries, proposals, knowledge, workflow, ruleConfig] = await Promise.all([
    listKnowledgeSources(), listIngestRuns(24), listClaimsForReview(100), listKnowledgeEntries(),
    listWorkflowProposals(), latestKnowledgeRelease(), latestWorkflowVersion(), latestRuleConfigRelease(),
  ])
  return (
    <KnowledgeBrainClient
      locale={locale}
      sources={sources.filter((source) => source.sourceType !== 'legacy_seed')}
      runs={runs}
      claims={claims}
      entries={entries}
      proposals={proposals}
      releases={{ knowledge: knowledge?.version ?? '—', workflow: workflow?.version ?? '—', ruleConfig: ruleConfig?.version ?? '—' }}
    />
  )
}
