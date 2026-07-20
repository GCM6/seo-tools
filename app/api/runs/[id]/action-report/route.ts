import { NextResponse } from 'next/server'
import { getBrandFacts, getProject, getRecommendations, getRun, getRunEvidence } from '@/lib/repositories'
import { resolveCredential } from '@/lib/credentials/store'
import { renderActionReportMarkdown, type EvidenceSummaryInput } from '@/lib/diagnosis/action-report-markdown'
import { buildActionReportSummaryPrompt, extractOpenAiSummary } from '@/lib/diagnosis/action-report-summary'

const DEFAULT_MODEL = 'gpt-5-mini'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'run_not_found' }, { status: 404 })

  const [project, recommendations, facts, apiKey, evidenceRows] = await Promise.all([
    getProject(run.projectId),
    getRecommendations(id),
    getBrandFacts(run.projectId),
    resolveCredential('OPENAI_API_KEY'),
    getRunEvidence(id),
  ])
  if (!apiKey) return NextResponse.json({ error: 'ai_not_configured' }, { status: 409 })

  // B2（P0-4）：evidenceRefs 原样是内部 ev_xxx ID，报告渲染时按此表解析成「类型+采集时间+关键值」
  // 的人类可读摘要（详见 lib/diagnosis/action-report-markdown.ts summarizeEvidenceRefs）。
  const evidenceById = new Map<string, EvidenceSummaryInput>(
    evidenceRows.map((row) => [
      row.id,
      {
        id: row.id,
        type: row.type,
        claimLevel: row.claimLevel,
        source: row.source,
        capturedAt: row.capturedAt,
        payload: row.payload,
      },
    ]),
  )

  const sourceReport = renderActionReportMarkdown(recommendations, {
    domain: project?.domain ?? '',
    runId: id,
    capturedAt: run.finishedAt ?? run.startedAt ?? '',
  }, {
    verifiedFacts: facts.filter((fact) => fact.status === 'verified').map((fact) => fact.factText),
    evidenceById,
  })

  try {
    // The user initiates this request from the output screen. Only the server
    // builds the source packet, so a browser cannot smuggle unreviewed text into
    // the model prompt.
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ACTION_REPORT_OPENAI_MODEL || process.env.AI_PROBE_OPENAI_MODEL || DEFAULT_MODEL,
        input: buildActionReportSummaryPrompt(sourceReport),
      }),
    })
    if (!response.ok) return NextResponse.json({ error: 'ai_summary_failed' }, { status: 502 })

    const executiveSummary = extractOpenAiSummary(
      await response.json(),
      recommendations.map((recommendation) => recommendation.id),
    )
    const markdown = renderActionReportMarkdown(recommendations, {
      domain: project?.domain ?? '',
      runId: id,
      capturedAt: run.finishedAt ?? run.startedAt ?? '',
    }, {
      verifiedFacts: facts.filter((fact) => fact.status === 'verified').map((fact) => fact.factText),
      executiveSummary,
      evidenceById,
    })

    return NextResponse.json({ markdown, generatedBy: 'openai', sourceLocked: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'ai_summary_failed'
    const status = code === 'summary_source_validation_failed' || code === 'invalid_summary_output' ? 422 : 502
    return NextResponse.json({ error: code }, { status })
  }
}
