import { NextResponse } from 'next/server'
import {
  getRun,
  getProject,
  getFindings,
  getRecommendations,
  getRunEvidence,
  getReferenceArtifacts,
} from '@/lib/repositories'
import { buildReport, type ReportFinding, type ReportRecommendation } from '@/lib/diagnosis/report'
import { renderReportMarkdown } from '@/lib/diagnosis/report-markdown'
import type { Pillar, FindingSeverity } from '@/lib/diagnosis/types'
import type { ReferenceArtifactRow } from '@/lib/diagnosis/reference-artifacts'
import type { EvidenceType } from '@/lib/types'

const PILLARS: Pillar[] = ['P1', 'P2', 'P3', 'P4', 'P5']

// 证据类型 → 支柱（与 report 页 helper 同源；此处内联避免跨层导出页面私有函数）。
const EVIDENCE_PILLAR: Partial<Record<EvidenceType, Pillar>> = {
  psi: 'P1',
  site_audit: 'P1',
  page_fetch: 'P1',
  schema: 'P2',
  render_check: 'P2',
  gsc: 'P3',
  dataforseo_labs: 'P3',
  dataforseo_serp: 'P4',
  ua_probe: 'P5',
  third_party_presence: 'P5',
  dataforseo_backlinks: 'P5',
}

function pillarsWithData(evidenceTypes: string[], findingPillars: (string | null)[]): Pillar[] {
  const set = new Set<Pillar>()
  for (const t of evidenceTypes) {
    const p = EVIDENCE_PILLAR[t as EvidenceType]
    if (p) set.add(p)
  }
  for (const p of findingPillars) if (p && (PILLARS as string[]).includes(p)) set.add(p as Pillar)
  return PILLARS.filter((p) => set.has(p))
}

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

  const [project, evidence, referenceArtifacts] = await Promise.all([
    getProject(run.projectId),
    getRunEvidence(id),
    getReferenceArtifacts(),
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
    ),
    artifacts,
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
