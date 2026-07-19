import { describe, it, expect, vi } from 'vitest'
import { collectProbesStage, type ProbeStageDeps } from './run-probes'
import type { AiProbeProvider } from './providers/types'

// step.run 直接执行（与 collect-evidence.test 同法）：编排逻辑与 Inngest 运行时解耦。
const step = { run: <T,>(_id: string, fn: () => Promise<T> | T) => Promise.resolve(fn()) }

function fakeProvider(id: AiProbeProvider['id'], opts?: { configured?: boolean; fail?: boolean; answer?: string }): AiProbeProvider {
  return {
    id,
    modelId: `${id}-model`,
    webSearchEnabled: true,
    isConfigured: () => opts?.configured ?? true,
    ask: vi.fn(async (prompt: string) => {
      if (opts?.fail) throw new Error(`${id} probe failed: 500`)
      return {
        answerText: opts?.answer ?? `I recommend Metadocu. (asked: ${prompt})`,
        citedUrls: ['https://metadocu.com/'],
        retrievedUrls: [],
        rawResponse: { echo: prompt },
        webSearchEnabled: true,
        temperature: null,
        topP: null,
      }
    }),
  }
}

function makeDeps(overrides?: Partial<ProbeStageDeps> & { providers?: AiProbeProvider[] }): {
  deps: ProbeStageDeps
  created: { prompts: unknown[]; evidence: Record<string, unknown>[]; results: Record<string, unknown>[] }
} {
  const created = { prompts: [] as unknown[], evidence: [] as Record<string, unknown>[], results: [] as Record<string, unknown>[] }
  const deps: ProbeStageDeps = {
    getProject: async () => ({
      id: 'proj_1',
      domain: 'https://metadocu.com/',
      industry: 'B2B SaaS · 项目协作',
      market: '中文 · 中国大陆',
      language: 'zh',
      competitors: ['Notion'],
      ownerId: 'local',
      createdAt: '',
      updatedAt: '',
    }),
    getProjectSettings: async () => ({
      projectId: 'proj_1',
      gscConnected: false,
      defaultModels: ['ChatGPT', 'Perplexity', 'Google AI Overviews'],
      probeN: 2,
      marketLocation: '',
      cachePolicy: 'default',
    }),
    buildProviders: () => overrides?.providers ?? [fakeProvider('openai'), fakeProvider('perplexity'), fakeProvider('gemini')],
    createPrompts: async (rows) => {
      created.prompts.push(...rows)
    },
    createEvidenceArtifact: (async (input: Record<string, unknown>) => {
      created.evidence.push(input)
      return [input]
    }) as unknown as ProbeStageDeps['createEvidenceArtifact'],
    createAiProbeResult: async (row) => {
      created.results.push(row as Record<string, unknown>)
    },
    ...overrides,
  }
  return { deps, created }
}

function run(deps: ProbeStageDeps) {
  const emitted: unknown[] = []
  const emit = async (msg: unknown) => {
    emitted.push(msg)
  }
  return collectProbesStage(
    { step, emit: emit as never, runId: 'run_1', projectId: 'proj_1', entryUrl: 'https://metadocu.com/' },
    deps,
  ).then((out) => ({ out, emitted }))
}

describe('collectProbesStage', () => {
  it('probes selected+configured providers only: 30 prompts × n × providers, persists everything', async () => {
    const { deps, created } = makeDeps()
    const { out } = await run(deps)

    // 选中 ChatGPT+Perplexity（AI Overviews 非探针引擎，忽略）；gemini 未选中不探
    expect(out.probedProviders.sort()).toEqual(['openai', 'perplexity'])
    expect(out).toMatchObject({ attemptedCount: 120, successfulCount: 120 })
    expect(created.prompts).toHaveLength(30)
    // 30 prompts × n=2 × 2 providers
    expect(created.results).toHaveLength(120)
    expect(created.evidence).toHaveLength(120)
    const ev = created.evidence[0]
    expect(ev.type).toBe('ai_answer')
    expect(ev.claimLevel).toBe('L3')
    const req = ev.request as Record<string, unknown>
    expect(req.provider).toBe('openai')
    expect(req.run_idx).toBe(1)
    expect(req.user_prompt).toBeTruthy()
    expect(req.web_search_enabled).toBe(true)
    const result = created.results[0]
    expect(result.brandPresent).toBe(true)
    expect(result.targetDomainCited).toBe(true)
    expect(result.runId).toBe('run_1')
    // 引用口径拆分修复：provider.ask() 返回的 retrievedUrls 穿线到落库结果（此处 fakeProvider
    // 恒返回空 retrievedUrls，targetDomainRetrieved 因此恒 false）。
    expect(result.retrievedUrls).toEqual([])
    expect(result.targetDomainRetrieved).toBe(false)
  })

  it('threads provider.retrievedUrls through parseProbeAnswer into the persisted probe result', async () => {
    const providerWithRetrieved: AiProbeProvider = {
      id: 'perplexity',
      modelId: 'perplexity-model',
      webSearchEnabled: true,
      isConfigured: () => true,
      ask: vi.fn(async () => ({
        answerText: 'no brand mention here',
        citedUrls: [],
        retrievedUrls: ['https://metadocu.com/search-hit'],
        rawResponse: {},
        webSearchEnabled: true,
        temperature: null,
        topP: null,
      })),
    }
    const { deps, created } = makeDeps({
      getProjectSettings: async () => ({
        projectId: 'proj_1',
        gscConnected: false,
        defaultModels: ['Perplexity'],
        probeN: 1,
        marketLocation: '',
        cachePolicy: 'default',
      }),
      providers: [providerWithRetrieved],
    })
    await run(deps)
    // citedUrls 为空——即便 retrievedUrls 命中目标域，targetDomainCited（"有依据"）仍是 false；
    // targetDomainRetrieved 是独立的弱一档信号，才应为 true。
    expect(created.results.every((r) => r.targetDomainCited === false)).toBe(true)
    expect(created.results.every((r) => r.targetDomainRetrieved === true)).toBe(true)
    expect(created.results.every((r) => (r.retrievedUrls as string[]).includes('https://metadocu.com/search-hit'))).toBe(true)
  })

  it('skips the whole stage when no selected provider has a key, persisting nothing', async () => {
    const { deps, created } = makeDeps({
      providers: [fakeProvider('openai', { configured: false }), fakeProvider('perplexity', { configured: false }), fakeProvider('gemini', { configured: false })],
    })
    const { out } = await run(deps)
    expect(out.probedProviders).toEqual([])
    expect(out).toMatchObject({ attemptedCount: 0, successfulCount: 0 })
    expect(created.prompts).toHaveLength(0)
    expect(created.evidence).toHaveLength(0)
  })

  it('keeps going when one provider fails: error evidence with error_code, no probe-result row', async () => {
    const { deps, created } = makeDeps({
      providers: [fakeProvider('openai', { fail: true }), fakeProvider('perplexity'), fakeProvider('gemini')],
    })
    const { out } = await run(deps)
    expect(out.probedProviders.sort()).toEqual(['openai', 'perplexity'])
    expect(out).toMatchObject({ attemptedCount: 120, successfulCount: 60 })

    // perplexity 全成功：60 条 result；openai 全失败：0 条 result 但留 60 条 error evidence
    expect(created.results).toHaveLength(60)
    expect(created.evidence).toHaveLength(120)
    const errorEvidence = created.evidence.filter((e) => (e.request as Record<string, unknown>).error_code)
    expect(errorEvidence).toHaveLength(60)
    expect((errorEvidence[0].request as Record<string, unknown>).provider).toBe('openai')
  })

  it('D2/D7: persists hedged/unknownAdmission on the probe result and threads project_settings.brandAliases into parsing', async () => {
    const { deps, created } = makeDeps({
      getProjectSettings: async () => ({
        projectId: 'proj_1',
        gscConnected: false,
        defaultModels: ['ChatGPT'],
        probeN: 1,
        marketLocation: '',
        cachePolicy: 'default',
        brandAliases: ['小docu'],
      }),
      providers: [
        fakeProvider('openai', {
          answer: '小docu 顾名思义应该是一款文档工具，但我没有找到相关信息确认其口碑。',
        }),
      ],
    })
    const { out } = await run(deps)
    expect(out.probedProviders).toEqual(['openai'])
    // 品牌 token（metadocu）不在回答里，全靠别名命中——证明 aliases 确实穿线到了 parseProbeAnswer。
    expect(created.results.every((r) => r.brandPresent === true)).toBe(true)
    expect(created.results.every((r) => r.hedged === true)).toBe(true)
    expect(created.results.every((r) => r.unknownAdmission === true)).toBe(true)
  })

  it('D1: persists prompts.branded straight from buildPromptSetV2', async () => {
    const { deps, created } = makeDeps()
    await run(deps)
    const brandPromptRows = (created.prompts as { intent: string; branded: boolean }[]).filter((p) => p.intent === 'brand')
    expect(brandPromptRows).toHaveLength(5)
    expect(brandPromptRows.every((p) => p.branded === true)).toBe(true)
    const recPromptRows = (created.prompts as { intent: string; branded: boolean }[]).filter((p) => p.intent === 'recommendation')
    expect(recPromptRows.every((p) => p.branded === false)).toBe(true)
  })

  it('emits per-prompt progress within 65..90 and ai_answer evidence events', async () => {
    const { deps } = makeDeps()
    const { emitted } = await run(deps)
    const progress = (emitted as { type: string; pct?: number }[]).filter((m) => m.type === 'progress')
    expect(progress.length).toBeGreaterThan(0)
    expect(progress.every((m) => (m.pct ?? 0) > 65 && (m.pct ?? 0) <= 90)).toBe(true)
    const evidenceMsgs = (emitted as { type: string; evidenceType?: string }[]).filter((m) => m.type === 'evidence_created')
    expect(evidenceMsgs).toHaveLength(30)
    expect(evidenceMsgs[0].evidenceType).toBe('ai_answer')
  })
})
