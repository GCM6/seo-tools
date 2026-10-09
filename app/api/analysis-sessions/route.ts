import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { analysisSessions, projectSettings, projects, runs } from '@/db/schema'
import { normalizeDomain } from '@/lib/analysis/normalize-domain'
import { RULES_VERSION } from '@/lib/diagnosis/types'
import { classifyAnalysis } from '@/lib/knowledge/classifier'
import {
  createSessionSteps,
  completeKnowledgeOnlySession,
  ensureBootstrapReleases,
  getAnalysisSession,
  getSessionSteps,
  latestRuleConfigRelease,
  latestWorkflowVersion,
} from '@/lib/knowledge/repository'
import type { WorkflowDefinition } from '@/lib/knowledge/workflow'
import { findActiveRun, getProjectByDomain } from '@/lib/repositories'
import { resolveSessionRunGate } from '@/lib/runs/gate'
import { startCheckup } from '@/lib/runs/start-checkup'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as {
    goal?: string; domain?: string; industry?: string; market?: string; language?: string; competitors?: string[]
    siteAgeMonths?: number; gscAvailable?: boolean; product?: string; targetCustomers?: string
  }
  const goal = body.goal?.trim() ?? ''
  if (!goal) return NextResponse.json({ error: 'goal_required' }, { status: 422 })
  const normalizedDomain = body.domain?.trim() ? normalizeDomain(body.domain.trim()) : undefined
  if (body.domain?.trim() && !normalizedDomain) return NextResponse.json({ error: 'invalid_domain' }, { status: 422 })
  const domain = normalizedDomain ?? undefined
  await ensureBootstrapReleases()
  const classification = classifyAnalysis({ ...body, goal, domain })
  const [workflowRow, ruleConfig] = await Promise.all([
    latestWorkflowVersion(), latestRuleConfigRelease(),
  ])
  if (!workflowRow) return NextResponse.json({ error: 'workflow_not_published' }, { status: 503 })
  const sessionId = `session_${crypto.randomUUID()}`
  const status = classification.missingFields.length ? 'waiting_input' : 'ready'
  await db.insert(analysisSessions).values({
    id: sessionId, goal, domain, scenario: classification.scenario, siteStage: classification.siteStage,
    detectedSymptoms: classification.detectedSymptoms, classificationConfidence: classification.confidence,
    missingFields: classification.missingFields, intakeContext: {
      industry: body.industry ?? '', market: body.market ?? '', language: body.language ?? '', competitors: body.competitors ?? [],
      siteAgeMonths: body.siteAgeMonths, gscAvailable: body.gscAvailable, product: body.product ?? '', targetCustomers: body.targetCustomers ?? '',
    },
    status, knowledgeReleaseVersion: workflowRow.knowledgeReleaseVersion, workflowVersion: workflowRow.version,
    rulesVersion: RULES_VERSION, ruleConfigVersion: ruleConfig?.version,
    classifierSnapshot: { provider: 'deterministic', model: 'goal_classifier_v1', promptVersion: 'none' },
  })
  const workflow = workflowRow.definition as unknown as WorkflowDefinition
  await createSessionSteps({ sessionId, scenario: classification.scenario, symptoms: classification.detectedSymptoms, workflow, goal, siteStage: classification.siteStage })
  if (classification.missingFields.length) {
    return NextResponse.json({ ...(await getAnalysisSession(sessionId)), steps: await getSessionSteps(sessionId) }, { status: 201 })
  }

  if (domain && (classification.scenario === 'diagnose' || classification.scenario === 'optimize')) {
    let project = await getProjectByDomain(domain)
    if (!project) {
      const [created] = await db.insert(projects).values({
        id: `proj_${crypto.randomUUID()}`, domain, industry: body.industry?.trim() ?? '', market: body.market?.trim() ?? '',
        language: 'en', competitors: body.competitors ?? [],
      }).returning()
      project = created
      await db.insert(projectSettings).values({ projectId: project.id })
    }
    const active = await findActiveRun(project.id)
    if (active) {
      if (active.analysisSessionId) {
        await db.delete(analysisSessions).where(eq(analysisSessions.id, sessionId))
        return NextResponse.json({
          ...(await getAnalysisSession(active.analysisSessionId)),
          steps: await getSessionSteps(active.analysisSessionId),
          reusedActiveRun: true,
        })
      }
      await Promise.all([
        db.update(analysisSessions).set({ projectId: project.id, runId: active.id, status: 'running', updatedAt: new Date().toISOString() }).where(eq(analysisSessions.id, sessionId)),
        db.update(runs).set({ analysisSessionId: sessionId }).where(eq(runs.id, active.id)),
      ])
    } else {
      // SP-A §3.5 闸门：会话补充的合规值先修项目；仍无效 → 不建 run、不派发，会话回到 waiting_input 要求补充。
      const sessionGate = resolveSessionRunGate(project, { industry: body.industry, market: body.market })
      await db.update(projects).set({ ...sessionGate.projectPatch, updatedAt: new Date().toISOString() }).where(eq(projects.id, project.id))
      if (sessionGate.gate) {
        await db.update(analysisSessions).set({
          projectId: project.id, status: 'waiting_input', missingFields: sessionGate.missingFields, updatedAt: new Date().toISOString(),
        }).where(eq(analysisSessions.id, sessionId))
        return NextResponse.json({ ...(await getAnalysisSession(sessionId)), steps: await getSessionSteps(sessionId), gate: sessionGate.gate }, { status: 201 })
      }
      const started = await startCheckup({ projectId: project.id, analysisSessionId: sessionId })
      if (!started.ok) {
        await db.update(analysisSessions).set({ status: 'failed', updatedAt: new Date().toISOString() }).where(eq(analysisSessions.id, sessionId))
        return NextResponse.json({ error: started.error, sessionId }, { status: started.status })
      }
      await db.update(analysisSessions).set({ projectId: project.id, runId: started.run.id, status: 'running', updatedAt: new Date().toISOString() }).where(eq(analysisSessions.id, sessionId))
    }
  } else if (classification.scenario === 'learn' || classification.scenario === 'new_build') {
    await completeKnowledgeOnlySession(sessionId)
  }
  return NextResponse.json({ ...(await getAnalysisSession(sessionId)), steps: await getSessionSteps(sessionId) }, { status: 201 })
}
