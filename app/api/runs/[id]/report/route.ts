import { NextResponse } from 'next/server'
import {
  getRun,
  getProject,
  getFindings,
  getRecommendations,
  getRunEvidence,
  getReferenceArtifacts,
  getRunDataSourceStatuses,
  getRunProbeResults,
  getConfirmedCompetitors,
} from '@/lib/repositories'
import { buildReport, buildReportContractInput, type ReportFinding, type ReportRecommendation } from '@/lib/diagnosis/report'
import { renderReportMarkdown } from '@/lib/diagnosis/report-markdown'
import { pillarsWithData } from '@/lib/diagnosis/pillars-with-data'
import type { FindingSeverity } from '@/lib/diagnosis/types'
import type { ReferenceArtifactRow } from '@/lib/diagnosis/reference-artifacts'

// GET /runs/{id}/report（§7）—— 默认返回只读聚合 JSON；?format=md 返回可下载的 Markdown 报告（八板块）。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [findings, recommendations] = await Promise.all([getFindings(id), getRecommendations(id)])

  const format = new URL(req.url).searchParams.get('format')
  if (format !== 'md') {
    // 不带 format：保持既有 JSON 行为不变。
    return NextResponse.json({ run, findings, recommendations })
  }

  const [project, evidence, referenceArtifacts, dataSourceStatuses, probeResults, competitors] = await Promise.all([
    getProject(run.projectId),
    getRunEvidence(id),
    getReferenceArtifacts(),
    getRunDataSourceStatuses(id),
    getRunProbeResults(id),
    getConfirmedCompetitors(run.projectId),
  ])

  const reportFindings: ReportFinding[] = findings.map((f) => ({
    id: f.id,
    side: f.side,
    pillar: f.pillar,
    title: f.title,
    description: f.description,
    severity: f.severity as FindingSeverity,
    claimType: f.claimType,
    confidence: f.confidence,
    evidenceRefs: f.evidenceRefs,
    status: f.status,
  }))

  const reportRecs: ReportRecommendation[] = recommendations.map((r) => ({
    id: r.id,
    findingId: r.findingId,
    what: r.what,
    why: r.why,
    expectedImpact: r.expectedImpact,
    effort: r.effort,
    priority: r.priority,
    confidence: r.confidence,
    status: r.status,
    outcome: r.outcome,
    validationMethod: r.validationMethod,
  }))

  const artifacts: ReferenceArtifactRow[] = referenceArtifacts.map((a) => ({
    artifactKey: a.artifactKey,
    sourceUrl: a.sourceUrl,
    lastVerifiedAt: a.lastVerifiedAt,
    refreshCadenceDays: a.refreshCadenceDays,
  }))

  const model = buildReport({
    findings: reportFindings,
    recommendations: reportRecs,
    pillarsWithData: pillarsWithData(
      evidence.map((e) => e.type),
      findings.map((f) => f.pillar),
      competitors.length,
    ),
    artifacts,
    ...buildReportContractInput({
      domain: project?.domain ?? '',
      targetMarket: project?.market,
      language: project?.language,
      capturedAt: run.finishedAt ?? run.startedAt ?? '',
      evidence,
      dataSources: dataSourceStatuses,
      aiValidSamples: probeResults.length,
      confirmedCompetitors: competitors.length,
    }),
    now: new Date(),
  })

  const md = renderReportMarkdown(model, {
    domain: project?.domain ?? '',
    runId: id,
    capturedAt: run.finishedAt ?? run.startedAt ?? '',
  })

  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="veris-report-${id}.md"`,
    },
  })
}
