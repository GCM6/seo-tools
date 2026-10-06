import { describe, it, expect, vi } from 'vitest'
import { createDataforseoProvider } from './provider'
import { collectDataforseoStage, type DataforseoStageDeps } from './collect-stage'
import {
  DFS_BACKLINKS_SUMMARY_LIVE_DOC,
  DFS_LABS_KEYWORD_OVERVIEW_LIVE_DOC,
  DFS_SERP_GOOGLE_ORGANIC_LIVE_ADVANCED_DOC,
  DFS_TASK_40101_BODY,
} from '@/lib/test-fixtures/real-shapes'

// 官方文档示例响应走真实解析器：与手写 mock 互为独立路径，防止解析器只对"理想形"成立（SP-A spec §7）。
const providerReturning = (body: string) =>
  createDataforseoProvider({
    login: 'u',
    password: 'p',
    fetchImpl: (async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
  })
const loc = { locationCode: 2840, languageCode: 'en' }

describe('DataForSEO 官方示例响应 → 真实解析器', () => {
  it('SERP organic/live/advanced：收自然结果（域名去 www），丢掉没有 domain/url 的模块（people_also_ask / knowledge_graph）', async () => {
    const out = await providerReturning(DFS_SERP_GOOGLE_ORGANIC_LIVE_ADVANCED_DOC).seedSerp(['flight ticket new york san francisco'], loc)
    const items = out.results[0].items
    expect(items.find((i) => i.type === 'organic')).toMatchObject({ domain: 't-mobile.com', url: 'https://www.t-mobile.com/cell-phone/apple-iphone-12-pro' })
    expect(items.map((i) => i.type)).not.toContain('people_also_ask')
    expect(items.map((i) => i.type)).not.toContain('knowledge_graph')
    expect(out.failedKeywords ?? []).toEqual([])
  })

  it('Labs keyword_overview/live：搜索量 / 难度 / CPC / 意图取自嵌套字段', async () => {
    const out = await providerReturning(DFS_LABS_KEYWORD_OVERVIEW_LIVE_DOC).keywordData(['iphone'], loc)
    expect(out).toEqual([{ keyword: 'iphone', searchVolume: 1220000, difficulty: 89, cpc: 6.45, intent: 'informational' }])
  })

  it('Backlinks summary/live：引荐域 / 外链数 / rank', async () => {
    const out = await providerReturning(DFS_BACKLINKS_SUMMARY_LIVE_DOC).backlinksSummary('example.com')
    expect(out).toMatchObject({ referringDomains: 12372, backlinks: 41245, rank: 371 })
  })

  it('每个请求都返回任务级 40101（搜索引擎端报错）→ 5 个子阶段都 failed / task_40101，不写任何证据', async () => {
    const deps = {
      createEvidenceArtifact: vi.fn(async (row: unknown) => [row]),
      upsertCompetitor: vi.fn(async (row: unknown) => [row]),
      linkEvidenceRaw: vi.fn(async () => undefined),
    }
    const outcomes = await collectDataforseoStage(
      {
        step: { run: async <T,>(_id: string, fn: () => Promise<T> | T) => fn() },
        emit: vi.fn(async () => undefined),
        runId: 'run_1',
        projectId: 'proj_1',
        domain: 'example.com',
        brand: 'example',
        market: 'global-en',
        seeds: [{ text: 'remove pdf metadata', source: 'manual' as const }],
        competitorTopN: 10,
        provider: providerReturning(DFS_TASK_40101_BODY),
        drainRaws: () => [],
        persistRaws: async () => [],
      },
      deps as unknown as DataforseoStageDeps,
    )
    expect(outcomes.map((o) => [o.stage, o.status, o.reason])).toEqual([
      ['seed_serp', 'failed', 'task_40101'],
      ['labs', 'failed', 'task_40101'],
      ['backlinks', 'failed', 'task_40101'],
      ['bing_index', 'failed', 'task_40101'],
      ['brand_serp', 'failed', 'task_40101'],
    ])
    expect(deps.createEvidenceArtifact).not.toHaveBeenCalled()
  })
})
