import { NextResponse } from 'next/server'
import {
  ensureBootstrapReleases,
  latestKnowledgeRelease,
  latestRuleConfigRelease,
  latestWorkflowVersion,
  listClaims,
  listIngestRuns,
  listKnowledgeEntries,
  listKnowledgeSources,
  listWorkflowProposals,
  searchPublishedKnowledge,
  seedKnowledgeSources,
} from '@/lib/knowledge/repository'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const query = url.searchParams.get('q')?.trim()
  if (query) {
    const requestedLimit = Number(url.searchParams.get('limit') ?? 12)
    return NextResponse.json({ query, results: await searchPublishedKnowledge(query, Number.isFinite(requestedLimit) ? requestedLimit : 12) })
  }
  await seedKnowledgeSources()
  await ensureBootstrapReleases()
  const [sources, ingestRuns, pendingClaims, entries, workflowProposals, knowledgeRelease, workflow, ruleConfig] = await Promise.all([
    listKnowledgeSources(), listIngestRuns(20), listClaims('pending_review', 100), listKnowledgeEntries(),
    listWorkflowProposals('pending_review'), latestKnowledgeRelease(), latestWorkflowVersion(), latestRuleConfigRelease(),
  ])
  return NextResponse.json({
    sources, ingestRuns, pendingClaims, entries, workflowProposals,
    releases: { knowledge: knowledgeRelease?.version ?? null, workflow: workflow?.version ?? null, ruleConfig: ruleConfig?.version ?? null },
  })
}
