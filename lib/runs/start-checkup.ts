import { db } from '@/db/client'
import { runs } from '@/db/schema'
import {
  getProject,
  getProjectSettings,
  getConfirmedCompetitors,
  getProjectRuns,
  findActiveRun,
  markRunStatus,
} from '@/lib/repositories'
import { inngest } from '@/lib/inngest/client'
import { buildCollectRequestedEvent } from '@/lib/inngest/events'
import { RULES_VERSION } from '@/lib/diagnosis/types'
import { PROMPT_TEMPLATE_VERSION } from '@/lib/probes/prompt-set'
import { runGateError } from './gate'
import { computeProtocolHash, chooseProtocolAnchor, type PriorRun } from './protocol'

type RunRow = typeof runs.$inferSelect
type ProjectRow = NonNullable<Awaited<ReturnType<typeof getProject>>>

export type StartCheckupResult =
  | { ok: true; run: RunRow }
  | { ok: false; status: 404 | 409 | 422 | 503; error: string; runId?: string; projectId?: string }

export interface StartCheckupDeps {
  getProject: (id: string) => Promise<ProjectRow | undefined>
  getProjectSettings: (projectId: string) => Promise<{ defaultModels: string[]; brandAliases: string[]; targetKeywords: string[] } | undefined>
  getConfirmedCompetitors: (projectId: string) => Promise<{ domain: string }[]>
  getProjectRuns: (projectId: string) => Promise<PriorRun[]>
  findActiveRun: (projectId: string) => Promise<{ id: string } | undefined>
  insertRun: (row: typeof runs.$inferInsert) => Promise<RunRow>
  markRunStatus: typeof markRunStatus
  sendCollect: (run: RunRow, url: string, baselineRunId?: string) => Promise<unknown>
  createLegacySession: (run: RunRow, project: ProjectRow) => Promise<void>
  now: () => string
}

function defaultDeps(): StartCheckupDeps {
  return {
    getProject,
    getProjectSettings,
    getConfirmedCompetitors,
    getProjectRuns,
    findActiveRun,
    insertRun: async (row) => (await db.insert(runs).values(row).returning())[0],
    markRunStatus,
    sendCollect: (run, url, baselineRunId) => inngest.send(buildCollectRequestedEvent(run, url, baselineRunId)),
    createLegacySession: async (run, project) => {
      const { createLegacySessionForRun } = await import('@/lib/knowledge/repository')
      await createLegacySessionForRun({ runId: run.id, project })
    },
    now: () => new Date().toISOString(),
  }
}

// 统一的「发起体检」（spec 2026-10-09 §5.3）：POST /api/runs、/runs/[id]/retest、分析会话两处入口共用。
// 按项目当前输入算协议指纹：与最近一次完成体检相同 → 沿用协议起点（runType retest），否则新协议（baseline）。
export async function startCheckup(
  input: { projectId: string; analysisSessionId?: string; legacySession?: boolean },
  deps: StartCheckupDeps = defaultDeps(),
): Promise<StartCheckupResult> {
  const project = await deps.getProject(input.projectId)
  if (!project) return { ok: false, status: 404, error: 'not_found' }

  // SP-A §3.5 闸门：品类/市场无效不得启动（也就不会触发任何付费采集）。
  const gate = runGateError(project)
  if (gate) return { ok: false, status: 422, error: gate, projectId: project.id }

  // 同项目并发保护（spec §2.3）。
  const active = await deps.findActiveRun(project.id)
  if (active) return { ok: false, status: 409, error: 'run_in_progress', runId: active.id }

  const [settings, confirmed, prior] = await Promise.all([
    deps.getProjectSettings(project.id),
    deps.getConfirmedCompetitors(project.id),
    deps.getProjectRuns(project.id),
  ])
  const protocolHash = computeProtocolHash({
    industry: project.industry,
    market: project.market,
    language: project.language,
    competitors: project.competitors ?? [],
    brandAliases: settings?.brandAliases ?? [],
    targetKeywords: settings?.targetKeywords ?? [],
    confirmedCompetitors: confirmed.map((c) => c.domain),
    engines: settings?.defaultModels ?? [],
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
  })
  const anchor = chooseProtocolAnchor(protocolHash, prior)
  const anchorRun = anchor.runType === 'retest' ? prior.find((r) => r.id === anchor.baselineRunId) : undefined

  const run = await deps.insertRun({
    id: `run_${crypto.randomUUID()}`,
    projectId: project.id,
    runType: anchor.runType,
    status: 'collecting',
    ...(anchorRun ? { protocolVersion: anchorRun.protocolVersion } : {}),
    rulesVersion: RULES_VERSION,
    startedAt: deps.now(),
    protocolHash,
    baselineRunId: anchor.runType === 'retest' ? anchor.baselineRunId : null,
    analysisSessionId: input.analysisSessionId ?? null,
  })

  // 兼容旧入口：尽力补建知识脑会话，失败不阻断。
  if (input.legacySession && !input.analysisSessionId) {
    try {
      await deps.createLegacySession(run, project)
    } catch (error) {
      console.warn('legacy_session_bridge_failed', error instanceof Error ? error.message : String(error))
    }
  }

  // 派发失败时不能让体检卡在 collecting。
  try {
    await deps.sendCollect(run, project.domain, anchor.runType === 'retest' ? anchor.baselineRunId : undefined)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await deps.markRunStatus(run.id, 'failed', { failureReason: `采集事件派发失败：${reason}`, finishedAt: deps.now() })
    return { ok: false, status: 503, error: 'dispatch_failed', runId: run.id }
  }
  return { ok: true, run }
}
