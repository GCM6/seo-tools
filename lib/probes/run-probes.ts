import { buildPromptSet, brandFromDomain, type ProbePrompt } from './prompt-set'
import { parseProbeAnswer, PROBE_PARSER_VERSION } from './parse'
import type { AiProbeProvider, AiProbeProviderId } from './providers/types'
import { sha256Hex } from '@/lib/collection/hash'
import type { createEvidenceArtifact } from '@/lib/repositories'
import type { RunProgressMessage } from '@/lib/inngest/channels'

// 表单引擎名 → 探针 provider 映射。「Google AI Overviews」是 SERP 特性而非
// 可调 API，不在探针范围（V1 SERP/AIO 截图另行处理），映射里刻意缺席。
const ENGINE_TO_PROVIDER: Record<string, AiProbeProviderId> = {
  ChatGPT: 'openai',
  Perplexity: 'perplexity',
  Gemini: 'gemini',
  DeepSeek: 'deepseek',
}

interface CollectStep {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

interface ProbeStageArgs {
  step: CollectStep
  emit: (msg: RunProgressMessage) => Promise<void>
  runId: string
  projectId: string
  entryUrl: string
}

interface ProjectLike {
  id: string
  domain: string
  industry: string
  market: string
  language: string
  competitors: string[]
}

interface ProjectSettingsLike {
  defaultModels: string[]
  probeN: number
}

export interface ProbeStageDeps {
  getProject: (id: string) => Promise<ProjectLike | undefined>
  getProjectSettings: (projectId: string) => Promise<ProjectSettingsLike | undefined>
  buildProviders: () => AiProbeProvider[]
  createPrompts: (rows: (ProbePrompt & { id: string; runId: string })[]) => Promise<unknown>
  createEvidenceArtifact: typeof createEvidenceArtifact
  createAiProbeResult: (row: {
    id: string
    runId: string
    promptId: string
    evidenceId: string
    provider: string
    modelId: string
    runIdx: number
    brandPresent: boolean
    targetDomainCited: boolean
    competitorsMentioned: string[]
    citedUrls: string[]
    sentiment: string
    rawAnswerHash: string
    parserVersion: string
  }) => Promise<unknown>
}

// 探针进度占整个采集 65→90 的区间
const PCT_BASE = 65
const PCT_SPAN = 25

function probeN(settings: ProjectSettingsLike | undefined): number {
  const envN = Number(process.env.AI_PROBE_N)
  if (Number.isInteger(envN) && envN > 0) return envN
  return settings?.probeN && settings.probeN > 0 ? settings.probeN : 5
}

// 探针阶段：每 prompt × provider × 样本一次调用 = 一个 Inngest step（幂等重放）。
// 单次失败不摧毁 run：错误留 error_code 证据现场，继续其余探针。
export async function collectProbesStage(
  { step, emit, runId, projectId }: ProbeStageArgs,
  deps: ProbeStageDeps,
): Promise<{ probedProviders: string[]; promptCount: number }> {
  const config = await step.run('probe-config', async () => {
    const project = await deps.getProject(projectId)
    if (!project) return null
    const settings = await deps.getProjectSettings(projectId)
    const selected = new Set(
      (settings?.defaultModels ?? []).map((m) => ENGINE_TO_PROVIDER[m]).filter(Boolean),
    )
    const activeProviderIds = deps
      .buildProviders()
      .filter((p) => selected.has(p.id) && p.isConfigured())
      .map((p) => p.id)
    return {
      activeProviderIds,
      n: probeN(settings),
      brand: brandFromDomain(project.domain),
      domain: new URL(project.domain).hostname.replace(/^www\./, ''),
      competitors: project.competitors ?? [],
      promptInput: {
        domain: project.domain,
        industry: project.industry,
        market: project.market,
        language: project.language || 'zh',
        competitors: project.competitors ?? [],
      },
    }
  })

  // 没有「已选中且配好 key」的 provider：整段跳过，不落任何 prompt，面板保持待接入
  if (!config || config.activeProviderIds.length === 0) return { probedProviders: [], promptCount: 0 }

  const providers = deps.buildProviders().filter((p) => config.activeProviderIds.includes(p.id))

  const prompts = await step.run('probe-persist-prompts', async () => {
    const rows = buildPromptSet(config.promptInput).map((p) => ({
      ...p,
      id: `pr_${crypto.randomUUID()}`,
      runId,
    }))
    await deps.createPrompts(rows)
    return rows
  })

  for (const [promptIdx, prompt] of prompts.entries()) {
    for (const provider of providers) {
      for (let runIdx = 1; runIdx <= config.n; runIdx++) {
        await step.run(`probe:${provider.id}:${promptIdx}:${runIdx}`, async () => {
          const runAt = new Date().toISOString()
          const requestBase = {
            provider: provider.id,
            model_id: provider.modelId,
            model_version_or_snapshot: null,
            system_prompt: null,
            user_prompt: prompt.text,
            market: prompt.market,
            language: prompt.language,
            location_hint: null,
            run_idx: runIdx,
            run_at: runAt,
            request_hash: sha256Hex(`${provider.id}|${provider.modelId}|${prompt.text}|${runIdx}`),
          }
          try {
            const answer = await provider.ask(prompt.text)
            const parsed = parseProbeAnswer({
              answerText: answer.answerText,
              citedUrls: answer.citedUrls,
              brand: config.brand,
              domain: config.domain,
              competitors: config.competitors,
            })
            const rawText = JSON.stringify(answer.rawResponse)
            const rawHash = sha256Hex(rawText)
            const evidenceId = `ev_${crypto.randomUUID()}`
            await deps.createEvidenceArtifact({
              id: evidenceId,
              projectId,
              runId,
              type: 'ai_answer',
              claimLevel: 'L3',
              source: provider.id,
              request: {
                ...requestBase,
                web_search_enabled: answer.webSearchEnabled,
                temperature: answer.temperature,
                top_p: answer.topP,
              },
              payload: {
                prompt: prompt.text,
                provider: provider.id,
                modelId: provider.modelId,
                runIdx,
                answerText: answer.answerText,
                ...parsed,
              },
              rawText,
              rawHash,
            })
            await deps.createAiProbeResult({
              id: `apr_${crypto.randomUUID()}`,
              runId,
              promptId: prompt.id,
              evidenceId,
              provider: provider.id,
              modelId: provider.modelId,
              runIdx,
              brandPresent: parsed.brandPresent,
              targetDomainCited: parsed.targetDomainCited,
              competitorsMentioned: parsed.competitorsMentioned,
              citedUrls: parsed.citedUrls,
              // V0 不做情绪判定：保持默认 neutral，不造信号
              sentiment: 'neutral',
              rawAnswerHash: rawHash,
              parserVersion: PROBE_PARSER_VERSION,
            })
            return { ok: true }
          } catch (err) {
            // 失败留协议现场（error_code），不写 probe result；样本冗余（n>1）兜底
            const message = err instanceof Error ? err.message : String(err)
            await deps.createEvidenceArtifact({
              id: `ev_${crypto.randomUUID()}`,
              projectId,
              runId,
              type: 'ai_answer',
              claimLevel: 'L3',
              source: provider.id,
              request: {
                ...requestBase,
                web_search_enabled: provider.webSearchEnabled,
                temperature: null,
                top_p: null,
                error_code: message,
              },
              payload: null,
              rawText: '',
              rawHash: sha256Hex(''),
            })
            return { ok: false, error: message }
          }
        })
      }
    }
    await emit({ type: 'evidence_created', evidenceType: 'ai_answer' })
    await emit({ type: 'progress', pct: PCT_BASE + Math.round(((promptIdx + 1) / prompts.length) * PCT_SPAN) })
  }

  return { probedProviders: providers.map((p) => p.id), promptCount: prompts.length }
}
