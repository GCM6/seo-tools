import { describe, it, expect, vi } from 'vitest'
import { collectDataforseoStage, type DataforseoStageArgs, type DataforseoStageDeps, type DfsSubStage } from './collect-stage'
import { createDataforseoProvider } from './provider'
import type { DataforseoProvider } from './types'
import type { RawResponse } from '@/lib/collection/result'

// 真实 repo 返回类型（Drizzle 查询构造器）比 mock 宽；测试只关心入参，故传入前收窄成 stage 期望的形状。
function asStageDeps(deps: ReturnType<typeof makeDeps>): DataforseoStageDeps {
  return deps as unknown as DataforseoStageDeps
}

function fakeProvider(over: Partial<DataforseoProvider> = {}): DataforseoProvider {
  return {
    isConfigured: () => true,
    seedSerp: vi.fn(async () => ({
      engine: 'google' as const,
      locationCode: 2826,
      languageCode: 'en',
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

const okRaw: RawResponse = { status: 200, contentType: 'application/json', body: '{"status_code":20000}' }

function makeArgs(over: Partial<DataforseoStageArgs> = {}): DataforseoStageArgs {
  return {
    step: { run: async <T,>(_id: string, fn: () => Promise<T> | T) => fn() },
    emit: vi.fn(async () => undefined),
    runId: 'run_1',
    projectId: 'proj_1',
    domain: 'example.com',
    brand: 'example',
    market: 'gb',
    seeds: [{ text: 'best crm', source: 'manual' as const }],
    competitorTopN: 10,
    provider: fakeProvider(),
    // 每次 drain 都"缓冲"了一条响应原文；persistRaws 按子阶段返回 raw id。
    drainRaws: vi.fn(() => [okRaw]),
    persistRaws: vi.fn(async (stage: DfsSubStage, raws: RawResponse[]) => raws.map((_, i) => `raw_${stage}_${i}`)),
    ...over,
  }
}

function makeDeps() {
  return {
    createEvidenceArtifact: vi.fn(async (row: { id: string; type: string; payload: unknown; claimLevel: string }) => [row]),
    upsertCompetitor: vi.fn(async (row: { domain: string; status?: string; source?: string }) => [row]),
    linkEvidenceRaw: vi.fn(async (ids: string[], evidenceId: string) => { void ids; void evidenceId }),
  }
}

const byStage = (outcomes: Awaited<ReturnType<typeof collectDataforseoStage>>) => Object.fromEntries(outcomes.map((o) => [o.stage, o]))

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

  it('全部成功 → 5 个子阶段都 collected、各 1 条证据', async () => {
    const outcomes = await collectDataforseoStage(makeArgs(), asStageDeps(makeDeps()))
    expect(outcomes).toEqual([
      { stage: 'seed_serp', status: 'collected', reason: null, evidenceCount: 1 },
      { stage: 'labs', status: 'collected', reason: null, evidenceCount: 1 },
      { stage: 'backlinks', status: 'collected', reason: null, evidenceCount: 1 },
      { stage: 'bing_index', status: 'collected', reason: null, evidenceCount: 1 },
      { stage: 'brand_serp', status: 'collected', reason: null, evidenceCount: 1 },
    ])
  })
})

describe('子阶段如实记状态（SP-A §4.2 / 第一波审查 I5）', () => {
  it('种子为空 → seed_serp 与 labs 记 not_attempted/no_seeds；backlinks、bing、品牌词照常执行', async () => {
    const provider = fakeProvider()
    const deps = makeDeps()
    const s = byStage(await collectDataforseoStage(makeArgs({ seeds: [], provider }), asStageDeps(deps)))
    expect(s.seed_serp).toEqual({ stage: 'seed_serp', status: 'not_attempted', reason: 'no_seeds', evidenceCount: 0 })
    expect(s.labs).toEqual({ stage: 'labs', status: 'not_attempted', reason: 'no_seeds', evidenceCount: 0 })
    expect(provider.seedSerp).not.toHaveBeenCalled()
    expect(provider.keywordData).not.toHaveBeenCalled()
    expect([s.backlinks.status, s.bing_index.status, s.brand_serp.status]).toEqual(['collected', 'collected', 'collected'])
    expect(deps.createEvidenceArtifact.mock.calls.map((c) => c[0].type)).toEqual(['dataforseo_backlinks', 'dataforseo_serp', 'dataforseo_serp'])
  })

  it('23 个种子里 8 个任务返回 40101 → seed_serp partial、原因 task_40101、证据 1 条', async () => {
    const seeds = Array.from({ length: 23 }, (_, i) => ({ text: `kw${i}`, source: 'site_phrase' as const }))
    const bad = new Set(seeds.slice(0, 8).map((s) => s.text))
    const seedSerp = vi.fn(async (keywords: string[]) => ({
      engine: 'google' as const, locationCode: 2826, languageCode: 'en',
      results: keywords.filter((k) => !bad.has(k)).map((keyword) => ({ keyword, items: [] })),
      failedKeywords: keywords.filter((k) => bad.has(k)).map((keyword) => ({ keyword, error: 'dataforseo task error 40101: Internal SE Server Error.', statusCode: 40101 })),
    }))
    const deps = makeDeps()
    const s = byStage(await collectDataforseoStage(makeArgs({ seeds, provider: fakeProvider({ seedSerp }) }), asStageDeps(deps)))
    expect(s.seed_serp).toEqual({ stage: 'seed_serp', status: 'partial', reason: 'task_40101', evidenceCount: 1 })
  })

  it('种子词全部失败 → seed_serp failed，不落空的 SERP 证据', async () => {
    const seedSerp = vi.fn(async (keywords: string[]) => ({
      engine: 'google' as const, locationCode: 2826, languageCode: 'en', results: [],
      failedKeywords: keywords.map((keyword) => ({ keyword, error: 'dataforseo task error 40501: x', statusCode: 40501 })),
    }))
    const deps = makeDeps()
    const s = byStage(await collectDataforseoStage(makeArgs({ seeds: [{ text: 'a', source: 'gsc' as const }, { text: 'b', source: 'gsc' as const }], provider: fakeProvider({ seedSerp }) }), asStageDeps(deps)))
    expect(s.seed_serp).toEqual({ stage: 'seed_serp', status: 'failed', reason: 'task_40501', evidenceCount: 0 })
    expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'dataforseo_serp' && (c[0].payload as { kind: string }).kind === 'seed_serp')).toBe(false)
  })

  it('40102（零结果）是测量值：沿用 provider 的处理，seed_serp 记 collected 而非 partial（真 provider + 假 fetch）', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const keyword = (JSON.parse(String(init?.body)) as { keyword: string }[])[0].keyword
      const task = keyword === 'rare phrase'
        ? { status_code: 40102, status_message: 'No Search Results.' }
        : { status_code: 20000, status_message: 'Ok.', result: [{ keyword, items: [] }] }
      return new Response(JSON.stringify({ status_code: 20000, tasks: [task] }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const provider = createDataforseoProvider({ login: 'u', password: 'p', fetchImpl: fetchImpl as unknown as typeof fetch })
    const deps = makeDeps()
    const outcomes = await collectDataforseoStage(
      makeArgs({ seeds: [{ text: 'best crm', source: 'gsc' as const }, { text: 'rare phrase', source: 'site_phrase' as const }], provider }),
      asStageDeps(deps),
    )
    expect(byStage(outcomes).seed_serp).toEqual({ stage: 'seed_serp', status: 'collected', reason: null, evidenceCount: 1 })
    const serpRow = deps.createEvidenceArtifact.mock.calls.map((c) => c[0]).find((r) => r.type === 'dataforseo_serp' && (r.payload as { kind: string }).kind === 'seed_serp')!
    expect((serpRow.payload as { results: { keyword: string; items: unknown[] }[] }).results).toContainEqual({ keyword: 'rare phrase', items: [] })
  })

  it('Labs 正常返回空数组 → collected、0 条证据、原因 no_data', async () => {
    const deps = makeDeps()
    const s = byStage(await collectDataforseoStage(makeArgs({ provider: fakeProvider({ keywordData: vi.fn(async () => []) }) }), asStageDeps(deps)))
    expect(s.labs).toEqual({ stage: 'labs', status: 'collected', reason: 'no_data', evidenceCount: 0 })
    expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'dataforseo_labs')).toBe(false)
  })

  it('Backlinks 抛 HTTP 402 → backlinks failed/http_402，其余子阶段照常', async () => {
    const deps = makeDeps()
    const provider = fakeProvider({ backlinksSummary: vi.fn(async () => { throw new Error('dataforseo request failed: 402') }) })
    const s = byStage(await collectDataforseoStage(makeArgs({ provider }), asStageDeps(deps)))
    expect(s.backlinks).toEqual({ stage: 'backlinks', status: 'failed', reason: 'http_402', evidenceCount: 0 })
    expect([s.seed_serp.status, s.labs.status, s.bing_index.status, s.brand_serp.status]).toEqual(['collected', 'collected', 'collected', 'collected'])
    expect(deps.createEvidenceArtifact.mock.calls.map((c) => c[0].type)).not.toContain('dataforseo_backlinks')
  })

  it('没有品牌词 → brand_serp 记 not_attempted/no_brand', async () => {
    const s = byStage(await collectDataforseoStage(makeArgs({ brand: '' }), asStageDeps(makeDeps())))
    expect(s.brand_serp).toEqual({ stage: 'brand_serp', status: 'not_attempted', reason: 'no_brand', evidenceCount: 0 })
  })

  it('provider 未配置 → 5 个子阶段都记 not_configured，不发请求', async () => {
    const provider = fakeProvider({ isConfigured: () => false })
    const outcomes = await collectDataforseoStage(makeArgs({ provider }), asStageDeps(makeDeps()))
    expect(outcomes.map((o) => o.status)).toEqual(Array(5).fill('not_configured'))
    expect(provider.seedSerp).not.toHaveBeenCalled()
  })
})

describe('原文存档（SP-A §4.3）：每个子阶段在同一个 step 内 drain 并存档，证据写好后挂上', () => {
  it('成功的子阶段：原文挂到对应证据；失败的子阶段：原文照样存档但不挂', async () => {
    const deps = makeDeps()
    const args = makeArgs({ provider: fakeProvider({ backlinksSummary: vi.fn(async () => { throw new Error('dataforseo request failed: 402') }) }) })
    await collectDataforseoStage(args, asStageDeps(deps))
    const persisted = vi.mocked(args.persistRaws).mock.calls.map((c) => c[0])
    expect(persisted).toEqual(['seed_serp', 'labs', 'backlinks', 'bing_index', 'brand_serp'])
    const labsEv = deps.createEvidenceArtifact.mock.calls.map((c) => c[0]).find((r) => r.type === 'dataforseo_labs')!
    expect(deps.linkEvidenceRaw).toHaveBeenCalledWith(['raw_labs_0'], labsEv.id)
    expect(deps.linkEvidenceRaw.mock.calls.some((c) => (c[0] as string[]).some((id) => id.startsWith('raw_backlinks')))).toBe(false)
  })
})

describe('市场单一真源（SP-A §3.1）', () => {
  it('location 取自市场表：gb → 2826/en', async () => {
    const provider = fakeProvider()
    await collectDataforseoStage(makeArgs({ market: 'gb', provider }), asStageDeps(makeDeps()))
    expect(provider.seedSerp).toHaveBeenCalledWith(['best crm'], { locationCode: 2826, languageCode: 'en' })
  })
  it('种子来源随 seed_serp 证据的 request 落库；请求 DataForSEO 只用 text（SP-A §3.3）', async () => {
    const provider = fakeProvider()
    const deps = makeDeps()
    await collectDataforseoStage(makeArgs({ provider }), asStageDeps(deps))
    expect(provider.seedSerp).toHaveBeenCalledWith(['best crm'], expect.anything())
    const rows = deps.createEvidenceArtifact.mock.calls.map((c) => c[0] as { request?: { kind?: string; seeds?: unknown } })
    const row = rows.find((r) => r.request?.kind === 'seed_serp')!
    expect(row.request?.seeds).toEqual([{ text: 'best crm', source: 'manual' }])
  })
  it('未知/旧市场文案 → 不发任何 DataForSEO 请求（不回落 US/en），5 个子阶段记 failed/market_unmapped', async () => {
    const provider = fakeProvider()
    const outcomes = await collectDataforseoStage(makeArgs({ market: 'English · Global', provider }), asStageDeps(makeDeps()))
    expect(provider.seedSerp).not.toHaveBeenCalled()
    expect(provider.backlinksSummary).not.toHaveBeenCalled()
    expect(outcomes.map((o) => [o.status, o.reason])).toEqual(Array(5).fill(['failed', 'market_unmapped']))
  })
})

describe('种子词 SERP 分步采集（2026-10-03：逐词请求后单步耗时随词数线性增长）', () => {
  it('每 20 个种子词一个 step，结果与失败词合并后落一条证据；每块的原文都挂到这条证据', async () => {
    const ids: string[] = []
    const seeds = Array.from({ length: 45 }, (_, i) => ({ text: `kw${i}`, source: 'site_phrase' as const }))
    const seedSerp = vi.fn(async (keywords: string[]) => ({
      engine: 'google' as const, locationCode: 2826, languageCode: 'en',
      results: keywords.filter((k) => k !== 'kw7').map((keyword) => ({ keyword, items: [] })),
      ...(keywords.includes('kw7') ? { failedKeywords: [{ keyword: 'kw7', error: 'dataforseo task error 40501: x', statusCode: 40501 }] } : {}),
    }))
    const deps = makeDeps()
    let chunk = 0
    const persistRaws = vi.fn(async (stage: DfsSubStage, raws: RawResponse[]) => raws.map(() => `raw_${stage}_${chunk++}`))
    await collectDataforseoStage(
      makeArgs({ seeds, persistRaws, provider: fakeProvider({ seedSerp }), step: { run: async <T,>(id: string, fn: () => Promise<T> | T) => (ids.push(id), fn()) } }),
      asStageDeps(deps),
    )
    expect(seedSerp.mock.calls.map((c) => (c[0] as string[]).length)).toEqual([20, 20, 5])
    expect(ids.filter((id) => id.startsWith('dfs-seed-serp'))).toEqual(['dfs-seed-serp-0', 'dfs-seed-serp-1', 'dfs-seed-serp-2'])
    const serpRow = deps.createEvidenceArtifact.mock.calls.map((c) => c[0]).find((r) => r.type === 'dataforseo_serp' && (r.payload as { kind: string }).kind === 'seed_serp')!
    expect((serpRow.payload as { results: unknown[] }).results).toHaveLength(44)
    expect((serpRow.payload as { failedKeywords: unknown[] }).failedKeywords).toEqual([{ keyword: 'kw7', error: 'dataforseo task error 40501: x', statusCode: 40501 }])
    expect(deps.linkEvidenceRaw).toHaveBeenCalledWith(['raw_seed_serp_0', 'raw_seed_serp_1', 'raw_seed_serp_2'], serpRow.id)
  })
})

describe('DataForSEO 返回 200 但内容不可用（第二波审查 C1，真 provider + 只假 fetch）', () => {
  const runWith = async (respond: () => Response) => {
    const provider = createDataforseoProvider({ login: 'u', password: 'p', fetchImpl: (async () => respond()) as unknown as typeof fetch })
    const deps = makeDeps()
    const outcomes = await collectDataforseoStage(makeArgs({ provider, seeds: [{ text: 'pdf metadata remover', source: 'manual' as const }] }), asStageDeps(deps))
    return { outcomes, deps }
  }
  it('维护页 HTML → 5 个子阶段都 failed/invalid_json，不写任何证据', async () => {
    const { outcomes, deps } = await runWith(() => new Response('<html><body>Service temporarily unavailable</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    expect(outcomes.map((o) => [o.stage, o.status, o.reason])).toEqual([
      ['seed_serp', 'failed', 'invalid_json'], ['labs', 'failed', 'invalid_json'], ['backlinks', 'failed', 'invalid_json'],
      ['bing_index', 'failed', 'invalid_json'], ['brand_serp', 'failed', 'invalid_json'],
    ])
    expect(deps.createEvidenceArtifact).not.toHaveBeenCalled()
  })
  it('任务成功但 result 为 null → 5 个子阶段都 failed/empty_result，不写任何证据', async () => {
    const { outcomes, deps } = await runWith(() => new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, status_message: 'Ok.', result: null }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    expect(outcomes.map((o) => [o.status, o.reason])).toEqual(Array(5).fill(['failed', 'empty_result']))
    expect(deps.createEvidenceArtifact).not.toHaveBeenCalled()
  })
})

describe('原文归属：每个子阶段存档的是自己那次请求的原文（第二波审查 T2）', () => {
  // 有状态的缓冲区：provider 每发一次请求就往里放一条带方法名的原文，drainRaws 取走并清空——与真 client 的 onResponse 同构。
  function bufferedRun(failing?: keyof DataforseoProvider) {
    const buffer: RawResponse[] = []
    const record = (method: string) => buffer.push({ status: 200, contentType: 'application/json', body: `{"method":"${method}"}` })
    const wrap = <K extends keyof DataforseoProvider>(method: K, impl: DataforseoProvider[K]) =>
      (async (...a: unknown[]) => {
        record(method)
        if (method === failing) throw new Error('dataforseo request failed: 500')
        return (impl as (...x: unknown[]) => unknown)(...a)
      }) as DataforseoProvider[K]
    const base = fakeProvider()
    const provider: DataforseoProvider = {
      ...base,
      seedSerp: wrap('seedSerp', base.seedSerp),
      keywordData: wrap('keywordData', base.keywordData),
      backlinksSummary: wrap('backlinksSummary', base.backlinksSummary),
      bingIndex: wrap('bingIndex', base.bingIndex),
      brandSerp: wrap('brandSerp', base.brandSerp),
    }
    const persisted: { stage: DfsSubStage; methods: string[] }[] = []
    const args = makeArgs({
      provider,
      drainRaws: () => buffer.splice(0),
      persistRaws: async (stage, raws) => {
        persisted.push({ stage, methods: raws.map((r) => (JSON.parse(r.body) as { method: string }).method) })
        return raws.map((_, i) => `raw_${stage}_${i}`)
      },
    })
    return { args, persisted }
  }
  const METHOD_OF: Record<DfsSubStage, string> = {
    seed_serp: 'seedSerp', labs: 'keywordData', backlinks: 'backlinksSummary', bing_index: 'bingIndex', brand_serp: 'brandSerp',
  }

  it('5 个子阶段各自只存档自己那一次请求的原文', async () => {
    const { args, persisted } = bufferedRun()
    await collectDataforseoStage(args, asStageDeps(makeDeps()))
    expect(persisted.map((p) => p.stage).sort()).toEqual(['backlinks', 'bing_index', 'brand_serp', 'labs', 'seed_serp'])
    for (const p of persisted) expect(p.methods, p.stage).toEqual([METHOD_OF[p.stage]])
  })

  it('原文在发请求的那个 step 里存档（第二波审查 T3）', async () => {
    const { args, persisted } = bufferedRun()
    const stepOf: Partial<Record<DfsSubStage, string | null>> = {}
    let active: string | null = null
    const persist = args.persistRaws
    args.persistRaws = async (stage, raws) => {
      stepOf[stage] = active
      return persist(stage, raws)
    }
    args.step = {
      run: async <T,>(id: string, fn: () => Promise<T> | T) => {
        active = id
        try {
          return await fn()
        } finally {
          active = null
        }
      },
    }
    await collectDataforseoStage(args, asStageDeps(makeDeps()))
    expect(persisted).toHaveLength(5)
    expect(stepOf).toEqual({ seed_serp: 'dfs-seed-serp-0', labs: 'dfs-labs', backlinks: 'dfs-backlinks', bing_index: 'dfs-bing', brand_serp: 'dfs-brand-serp' })
  })

  it('请求失败的子阶段也存档自己的原文，不串到下一个子阶段', async () => {
    const { args, persisted } = bufferedRun('backlinksSummary')
    await collectDataforseoStage(args, asStageDeps(makeDeps()))
    for (const p of persisted) expect(p.methods, p.stage).toEqual([METHOD_OF[p.stage]])
  })
})
