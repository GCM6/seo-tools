import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { analysisSessions, projectSettings, projects, runs, workflowArtifacts, workflowStepRuns } from '@/db/schema'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'
import { RULES_VERSION } from '@/lib/diagnosis/types'
import { inngest } from '@/lib/inngest/client'
import { buildCollectRequestedEvent } from '@/lib/inngest/events'
import { classifyAnalysis } from '@/lib/knowledge/classifier'
import {
  completeKnowledgeOnlySession,
  createSessionSteps,
  getAnalysisSession,
  getSessionArtifacts,
  getSessionSteps,
  latestWorkflowVersion,
} from '@/lib/knowledge/repository'
import type { WorkflowDefinition } from '@/lib/knowledge/workflow'
import { findActiveRun, getProjectByDomain } from '@/lib/repositories'
import { resolveSessionRunGate } from '@/lib/runs/gate'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAnalysisSession(id)
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ...session, steps: await getSessionSteps(id), artifacts: await getSessionArtifacts(id) })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAnalysisSession(id)
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (session.status !== 'waiting_input' && session.status !== 'ready') {
    return NextResponse.json({ error: 'session_not_editable' }, { status: 409 })
  }
  const body = await req.json().catch(() => ({})) as {
    domain?: string; industry?: string; market?: string; language?: string; competitors?: string[]
    siteAgeMonths?: number; gscAvailable?: boolean; product?: string; targetCustomers?: string
  }
  const oldContext = session.intakeContext as Record<string, unknown>
  const domainInput = body.domain?.trim() || session.domain || ''
  const domain = domainInput ? normalizeDomain(domainInput) ?? undefined : undefined
  if (domainInput && !domain) return NextResponse.json({ error: 'invalid_domain' }, { status: 422 })
  const intake = {
    goal: session.goal,
    domain,
    industry: body.industry ?? String(oldContext.industry ?? ''),
    market: body.market ?? String(oldContext.market ?? ''),
    language: body.language ?? String(oldContext.language ?? ''),
    competitors: body.competitors ?? (Array.isArray(oldContext.competitors) ? oldContext.competitors as string[] : []),
    siteAgeMonths: body.siteAgeMonths ?? (typeof oldContext.siteAgeMonths === 'number' ? oldContext.siteAgeMonths : undefined),
    gscAvailable: body.gscAvailable ?? (typeof oldContext.gscAvailable === 'boolean' ? oldContext.gscAvailable : undefined),
    product: body.product ?? String(oldContext.product ?? ''),
    targetCustomers: body.targetCustomers ?? String(oldContext.targetCustomers ?? ''),
  }
  const classification = classifyAnalysis(intake)
  const workflowRow = await latestWorkflowVersion()
  if (!workflowRow) return NextResponse.json({ error: 'workflow_not_published' }, { status: 503 })
  await db.delete(workflowArtifacts).where(eq(workflowArtifacts.sessionId, id))
  await db.delete(workflowStepRuns).where(eq(workflowStepRuns.sessionId, id))
  await db.update(analysisSessions).set({
    domain,
    scenario: classification.scenario,
    siteStage: classification.siteStage,
    detectedSymptoms: classification.detectedSymptoms,
    classificationConfidence: classification.confidence,
    missingFields: classification.missingFields,
    intakeContext: intake,
    status: classification.missingFields.length ? 'waiting_input' : 'ready',
    updatedAt: new Date().toISOString(),
  }).where(eq(analysisSessions.id, id))
  await createSessionSteps({
    sessionId: id,
    scenario: classification.scenario,
    symptoms: classification.detectedSymptoms,
    workflow: workflowRow.definition as unknown as WorkflowDefinition,
    goal: session.goal,
    siteStage: classification.siteStage,
  })
  if (classification.missingFields.length) {
    return NextResponse.json({ ...(await getAnalysisSession(id)), steps: await getSessionSteps(id), artifacts: [] })
  }

  if (classification.scenario === 'learn' || classification.scenario === 'new_build') {
    await completeKnowledgeOnlySession(id)
  } else if (domain) {
    let project = await getProjectByDomain(domain)
    if (!project) {
      const [created] = await db.insert(projects).values({
        id: `proj_${crypto.randomUUID()}`,
        domain,
        industry: intake.industry.trim(),
        market: intake.market.trim(),
        language: 'en',
        competitors: intake.competitors,
      }).returning()
      project = created
      await db.insert(projectSettings).values({ projectId: project.id })
    }
    // SP-A §3.5 闸门：补充的合规值先修项目；仍无效 → 不建 run、不派发，继续等待补充。
    const sessionGate = resolveSessionRunGate(project, { industry: intake.industry, market: intake.market })
    await db.update(projects).set({ ...sessionGate.projectPatch, updatedAt: new Date().toISOString() }).where(eq(projects.id, project.id))
    if (sessionGate.gate) {
      await db.update(analysisSessions).set({
        projectId: project.id, status: 'waiting_input', missingFields: sessionGate.missingFields, updatedAt: new Date().toISOString(),
      }).where(eq(analysisSessions.id, id))
      return NextResponse.json({ ...(await getAnalysisSession(id)), steps: await getSessionSteps(id), artifacts: [], gate: sessionGate.gate })
    }
    // 同项目并发保护（与 POST 会话、POST /runs 一致；第一波审查 I2）：已有进行中的 run（如向导刚建的）就把会话挂上去，
    // 不建第二个 run、不重复派发付费采集。
    const active = await findActiveRun(project.id)
    if (active) {
      await Promise.all([
        db.update(analysisSessions).set({ projectId: project.id, runId: active.id, status: 'running', updatedAt: new Date().toISOString() }).where(eq(analysisSessions.id, id)),
        active.analysisSessionId ? Promise.resolve() : db.update(runs).set({ analysisSessionId: id }).where(eq(runs.id, active.id)),
      ])
      return NextResponse.json({ ...(await getAnalysisSession(id)), steps: await getSessionSteps(id), artifacts: await getSessionArtifacts(id), reusedActiveRun: true })
    }
    const [run] = await db.insert(runs).values({
      id: `run_${crypto.randomUUID()}`,
      projectId: project.id,
      runType: 'baseline',
      status: 'collecting',
      rulesVersion: RULES_VERSION,
      analysisSessionId: id,
    }).returning()
    await db.update(analysisSessions).set({ projectId: project.id, runId: run.id, status: 'running', updatedAt: new Date().toISOString() }).where(eq(analysisSessions.id, id))
    try {
      await inngest.send(buildCollectRequestedEvent(run, domain))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await Promise.all([
        db.update(runs).set({ status: 'failed', failureReason: `采集事件派发失败：${message}`, finishedAt: new Date().toISOString() }).where(eq(runs.id, run.id)),
        db.update(analysisSessions).set({ status: 'failed', updatedAt: new Date().toISOString() }).where(eq(analysisSessions.id, id)),
      ])
      return NextResponse.json({ error: 'dispatch_failed', sessionId: id }, { status: 503 })
    }
  }
  return NextResponse.json({ ...(await getAnalysisSession(id)), steps: await getSessionSteps(id), artifacts: await getSessionArtifacts(id) })
}
