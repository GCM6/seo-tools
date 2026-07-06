import { describe, it, expect, vi } from 'vitest'
import { collectDataforseoStage, type DataforseoStageArgs, type DataforseoStageDeps } from './collect-stage'
import type { DataforseoProvider } from './types'

// 真实 repo 返回类型（Drizzle 查询构造器）比 mock 宽；测试只关心入参，故传入前收窄成 stage 期望的形状。
function asStageDeps(deps: ReturnType<typeof makeDeps>): DataforseoStageDeps {
  return deps as unknown as DataforseoStageDeps
}

function fakeProvider(over: Partial<DataforseoProvider> = {}): DataforseoProvider {
  return {
    isConfigured: () => true,
    seedSerp: vi.fn(async () => ({
      engine: 'google' as const,
      locationCode: 2276,
      languageCode: 'de',
      results: [
        {
          keyword: 'best crm',
          items: [
            { domain: 'rival.com', url: 'https://rival.com/crm', rank: 1, title: 'CRM', type: 'organic' },
            { domain: 'example.com', url: 'https://example.com', rank: 4, title: 'Us', type: 'organic' },
          ],
        },
      ],
    })),
    bingIndex: vi.fn(async () => ({ engine: 'bing' as const, domain: 'example.com', totalCount: 12, itemCount: 5 })),
    brandSerp: vi.fn(async () => ({ engine: 'google' as const, brandQuery: 'example', hasKnowledgePanel: false, ownDomainPresent: true, items: [] })),
    keywordData: vi.fn(async () => [{ keyword: 'best crm', searchVolume: 500, difficulty: 30, cpc: 2, intent: 'commercial' }]),
    backlinksSummary: vi.fn(async () => ({ target: 'example.com', referringDomains: 20, backlinks: 100, rank: 300, anchors: [], newLost: null })),
    ...over,
  }
}

function makeArgs(over: Partial<DataforseoStageArgs> = {}): DataforseoStageArgs {
  return {
    step: { run: async <T,>(_id: string, fn: () => Promise<T> | T) => fn() },
    emit: vi.fn(async () => undefined),
    runId: 'run_1',
    projectId: 'proj_1',
    domain: 'example.com',
    brand: 'example',
    market: 'de',
    seeds: ['best crm'],
    competitorTopN: 10,
    provider: fakeProvider(),
    ...over,
  }
}

function makeDeps() {
  return {
    createEvidenceArtifact: vi.fn(async (row: { type: string; payload: unknown; claimLevel: string }) => [row]),
    upsertCompetitor: vi.fn(async (row: { domain: string; status?: string; source?: string }) => [row]),
  }
}

describe('collectDataforseoStage', () => {
  it('落 SERP/Labs/Backlinks/Bing/品牌 五类证据，且都是 L3', async () => {
    const deps = makeDeps()
    await collectDataforseoStage(makeArgs(), asStageDeps(deps))
    const types = deps.createEvidenceArtifact.mock.calls.map((c) => c[0].type)
    // seed_serp / labs / backlinks / bing(serp) / brand(serp)
    expect(types.filter((t) => t === 'dataforseo_serp')).toHaveLength(3) // seed + bing + brand
    expect(types).toContain('dataforseo_labs')
    expect(types).toContain('dataforseo_backlinks')
    deps.createEvidenceArtifact.mock.calls.forEach((c) => expect((c[0] as { claimLevel: string }).claimLevel).toBe('L3'))
  })

  it('识别候选竞品并 upsert 为 candidate（排除本站与平台域）', async () => {
    const deps = makeDeps()
    await collectDataforseoStage(makeArgs(), asStageDeps(deps))
    const upserted = deps.upsertCompetitor.mock.calls.map((c) => c[0])
    expect(upserted.map((u) => u.domain)).toEqual(['rival.com']) // example.com 是本站，剔除
    upserted.forEach((u) => {
      expect(u.status).toBe('candidate')
      expect(u.source).toBe('serp_overlap')
    })
  })

  it('seed_serp payload 带 kind 判别符', async () => {
    const deps = makeDeps()
    await collectDataforseoStage(makeArgs(), asStageDeps(deps))
    const serpEv = deps.createEvidenceArtifact.mock.calls.find(
      (c) => c[0].type === 'dataforseo_serp' && (c[0].payload as { kind?: string }).kind === 'seed_serp',
    )
    expect(serpEv).toBeTruthy()
    expect((serpEv![0].payload as { results: unknown[] }).results).toHaveLength(1)
  })

  it('provider 未配置或 seeds 为空 → 完全 no-op', async () => {
    const deps1 = makeDeps()
    await collectDataforseoStage(makeArgs({ seeds: [] }), asStageDeps(deps1))
    expect(deps1.createEvidenceArtifact).not.toHaveBeenCalled()

    const deps2 = makeDeps()
    await collectDataforseoStage(makeArgs({ provider: fakeProvider({ isConfigured: () => false }) }), asStageDeps(deps2))
    expect(deps2.createEvidenceArtifact).not.toHaveBeenCalled()
  })

  it('单个 provider 调用失败仅降级，不阻断其余证据', async () => {
    const deps = makeDeps()
    const provider = fakeProvider({ backlinksSummary: vi.fn(async () => { throw new Error('quota') }) })
    await collectDataforseoStage(makeArgs({ provider }), asStageDeps(deps))
    const types = deps.createEvidenceArtifact.mock.calls.map((c) => c[0].type)
    expect(types).not.toContain('dataforseo_backlinks') // 失败
    expect(types).toContain('dataforseo_labs') // 其余仍落
  })
})
