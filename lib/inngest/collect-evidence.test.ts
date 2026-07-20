import { describe, it, expect, vi } from 'vitest'
import { NonRetriableError } from 'inngest'
import { collectEvidenceHandler } from './collect-evidence'
import { SsrfBlockedError } from '@/lib/security/ssrf-guard'
import type { NewEvidenceArtifact } from '@/lib/repositories'
import { createBrowserlessRenderProvider } from '@/lib/render/browserless-provider'

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    assertPublicUrl: vi.fn(async (u: string) => new URL(u)),
    fetchPageFacts: vi.fn(async () => ({
      rawHtml: '<html><body>hi</body></html>',
      mainTextChars: 2,
      canonicalUrl: 'https://example.com/',
      metaRobots: 'index,follow',
    })),
    fetchRobotsCheck: vi.fn(async () => ({ allowed: true, rawText: '' })),
    extractSchema: vi.fn(() => ({
      types: ['Organization'],
      raw: [{ '@type': 'Organization' }],
      sameAs: [],
      blocks: [{ ok: true, parsed: { '@type': 'Organization' }, rawText: '{"@type":"Organization"}' }],
    })),
    renderProvider: {
      renderMainText: vi.fn(async () => ({ html: '<html>rendered</html>', mainTextChars: 400 })),
    },
    searchVisibilityProvider: {
      isConfigured: vi.fn(() => false),
      checkSite: vi.fn(),
    },
    // 默认关闭 PSI，保持既有用例的证据计数不变；专门的 PSI 用例里再打开。
    isPsiConfigured: vi.fn(() => false),
    fetchPageSpeedInsights: vi.fn(async () => ({
      strategy: 'mobile' as const,
      crux: { lcpMs: 4200, inpMs: 120, cls: 0.2, hasFieldData: true },
      lighthouse: { performanceScore: 40, opportunities: [{ id: 'a', title: '压缩图片', savingsMs: 800 }], ttfbMs: 1500 },
    })),
    // GSC 默认不连接（getProjectSettings 返回 undefined），GSC 采集块整体跳过；专门用例里再启用。
    refreshGscAccessToken: vi.fn(async () => ({ accessToken: 'access_tok' })),
    isGscPlatformConfigured: vi.fn(() => false),
    querySearchAnalytics: vi.fn(async () => [{ keys: ['buy widgets'], clicks: 10, impressions: 500, ctr: 0.02, position: 8 }]),
    upsertKeyword: vi.fn(async (row: unknown) => {
      void row
      return [{ id: 'kw_1' }]
    }),
    createKeywordMetrics: vi.fn(async (rows: { keywordId: string; evidenceId?: string | null }[]) => {
      void rows
      return []
    }),
    createEvidenceArtifact: vi.fn(async (input: NewEvidenceArtifact) => [input]),
    markRunStatus: vi.fn(async () => undefined),
    runProbes: vi.fn(async () => ({ probedProviders: [], promptCount: 0, attemptedCount: 0, successfulCount: 0 })),
    getProjectSettings: vi.fn(async () => undefined),
    discoverSitemaps: vi.fn(async () => ({ files: [], pageUrls: [], warnings: [] })),
    runCrawlBatch: vi.fn(async (state: unknown) => ({
      state: { ...(state as Record<string, unknown>), frontier: [], checkedCount: 1, done: true },
      results: [
        {
          url: 'https://example.com/', finalUrl: 'https://example.com/', httpStatus: 200, title: 'home',
          canonicalUrl: null, metaRobots: null, mainTextChars: 2, contentHash: 'h', internalLinks: [],
          checkStatus: 'checked', errorReason: null, discoveredVia: 'entry', depth: 0,
        },
      ],
    })),
    upsertSitePages: vi.fn(async () => undefined),
    getSitePages: vi.fn(async () => [
      {
        id: 'sp_1', projectId: 'proj_1', url: 'https://example.com/', discoveredVia: 'entry', depth: 0,
        httpStatus: 200, finalUrl: null, title: 'home', canonicalUrl: null, metaRobots: null,
        mainTextChars: 2, contentHash: 'h', inboundLinkCount: 0, checkStatus: 'checked',
        errorReason: null, templateId: null, isKeyPage: false,
      },
    ]),
    updateInboundCounts: vi.fn(async () => undefined),
    syncUrlTemplates: vi.fn(async () => undefined),
    getProjectTemplates: vi.fn(async () => [
      { id: 'tpl_1', projectId: 'proj_1', pattern: '/', pageCount: 1, representativePageId: 'sp_1', source: 'heuristic' },
    ]),
    getRunProbeResults: vi.fn(async () => []),
    // GEO 采集器（Phase D）默认在基线用例里降级（抛错→block try/catch no-op），保持既有证据计数；
    // 专门用例里提供可用 fake 断言 ua_probe / third_party_presence / social_presence 证据。
    collectUaProbe: vi.fn(async () => { throw new Error('ua-probe disabled in baseline') }),
    checkThirdPartyPresence: vi.fn(async () => { throw new Error('third-party disabled in baseline') }),
    checkSocialPresence: vi.fn(async () => { throw new Error('social-presence disabled in baseline') }),
    // DataForSEO 默认未配置，采集块整体跳过；专门用例里再启用。
    isDataforseoConfigured: vi.fn(() => false),
    dataforseoProvider: { isConfigured: vi.fn(() => false) },
    runDataforseo: vi.fn(async () => undefined),
    // AIO（Google AI Overviews）默认未配置，采集块整体跳过；专门用例里再启用。
    aioProvider: { isConfigured: vi.fn(() => false), fetchAioForKeyword: vi.fn() },
    createSerpAioResult: vi.fn(async () => undefined),
    getRunPrompts: vi.fn(async () => []),
    getProject: vi.fn(async () => ({ id: 'proj_1', domain: 'example.com', industry: '', market: 'US', language: 'en', competitors: [] })),
    sendDiagnose: vi.fn(async () => undefined),
    writeDataSourceStatus: vi.fn(async () => undefined),
    ...overrides,
  }
}

// deps 保留 vi.fn() 的 Mock 类型（断言里要用 .mock.calls），只在传给
// collectEvidenceHandler 时转成它期望的 CollectDeps 形状。
function asCollectDeps(deps: ReturnType<typeof makeDeps>): Parameters<typeof collectEvidenceHandler>[1] {
  return deps as unknown as Parameters<typeof collectEvidenceHandler>[1]
}

function makeArgs(options: { cachedSteps?: Record<string, unknown> } = {}) {
  const published: unknown[] = []
  return {
    args: {
      event: { data: { runId: 'run_1', projectId: 'proj_1', url: 'https://example.com' } },
      // 复刻 Inngest 真实行为：step.run 的返回值经 JSON 序列化往返落库再回放，
      // URL / Date 等富对象会退化成字符串（URL.toJSON() → href）。用直通 fn() 的假
      // step 会漏掉这一层，导致「validUrl 实为 string、.hostname 为 undefined」的线上崩溃测不出来。
      step: {
        run: async <T,>(id: string, fn: () => Promise<T> | T): Promise<T> => {
          if (Object.hasOwn(options.cachedSteps ?? {}, id)) return options.cachedSteps![id] as T
          const out = await fn()
          return (out === undefined ? undefined : JSON.parse(JSON.stringify(out))) as T
        },
      },
      publish: async (msg: unknown) => {
        published.push(msg)
      },
    },
    published,
  }
}

describe('collectEvidenceHandler', () => {
  it('uses Browserless as a real renderer fallback and persists the same render_check contract', async () => {
    const browserlessFetch = vi.fn(async () =>
      new Response('<html><body><article>JavaScript-rendered product content</article></body></html>', { status: 200 }),
    )
    const renderer = createBrowserlessRenderProvider({ apiToken: 'browserless-token', fetchImpl: browserlessFetch as never })
    const resolveRenderProvider = vi.fn(async () => renderer)
    const deps = makeDeps({
      // 只提供解析器，模拟默认依赖从 DB > env 选中 Browserless 的真实路径。
      resolveRenderProvider,
    })
    const { args } = makeArgs()

    await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(resolveRenderProvider).toHaveBeenCalledOnce()
    expect(browserlessFetch).toHaveBeenCalled()
    const renderEvidence = deps.createEvidenceArtifact.mock.calls
      .map((call) => call[0])
      .find((artifact) => artifact.type === 'render_check')
    expect(renderEvidence).toMatchObject({
      claimLevel: 'L4',
      payload: expect.objectContaining({ initialHtmlMainTextChars: 2, renderedMainTextChars: 'JavaScript-rendered product content'.length }),
    })
  })

  it('runs checks, persists real evidence artifacts, and marks the run collected', async () => {
    const deps = makeDeps()
    const { args, published } = makeArgs()

    const result = await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(result).toEqual({ status: 'collected' })
    expect(deps.fetchPageFacts).toHaveBeenCalledWith('https://example.com/')
    expect(deps.fetchRobotsCheck).toHaveBeenCalledWith('https://example.com/')
    expect(deps.renderProvider.renderMainText).toHaveBeenCalledWith('https://example.com/')

    expect(deps.createEvidenceArtifact).toHaveBeenCalledTimes(4)
    const types = deps.createEvidenceArtifact.mock.calls.map((c) => c[0].type)
    expect(types).toEqual(['page_fetch', 'schema', 'render_check', 'site_audit'])
    deps.createEvidenceArtifact.mock.calls.forEach((c) => expect(c[0].claimLevel).toBe('L4'))

    expect(deps.markRunStatus).toHaveBeenCalledWith('run_1', 'collected', expect.objectContaining({ finishedAt: expect.any(String) }))
    // 采集落地后接力触发诊断生成链
    expect(deps.sendDiagnose).toHaveBeenCalledWith({ runId: 'run_1', projectId: 'proj_1' })

    const progressValues = published.map((m: unknown) => (m as { data: { pct?: number } }).data.pct).filter((v) => v !== undefined)
    expect(progressValues).toEqual([8, 20, 45, 65, 90])
    expect(published.some((m) => (m as { data: { type: string } }).data.type === 'done')).toBe(true)
  })

  it('runs site:domain visibility first when the Google search provider is configured', async () => {
    const deps = makeDeps({
      searchVisibilityProvider: {
        isConfigured: vi.fn(() => true),
        checkSite: vi.fn(async () => ({
          provider: 'google_custom_search',
          query: 'site:example.com',
          domain: 'example.com',
          totalResults: 7,
          resultCount: 2,
          homePagePresent: true,
          firstResultUrl: 'https://example.com/',
          results: [],
          checkedAt: '2026-07-01T00:00:00.000Z',
        })),
      },
    })
    const { args, published } = makeArgs()

    await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(deps.searchVisibilityProvider.checkSite).toHaveBeenCalledWith('example.com')
    // serp_snapshot + page_fetch + schema + render_check + site_audit（爬取默认开启）
    expect(deps.createEvidenceArtifact).toHaveBeenCalledTimes(5)
    expect(deps.createEvidenceArtifact.mock.calls[0][0]).toMatchObject({
      type: 'serp_snapshot',
      claimLevel: 'L2',
      source: 'google_custom_search',
      payload: expect.objectContaining({ query: 'site:example.com', totalResults: 7 }),
    })
    expect(published.some((m) => (m as { data: { evidenceType?: string } }).data.evidenceType === 'serp_snapshot')).toBe(true)
  })

  it('collects and persists a PSI evidence artifact when PSI is configured', async () => {
    const deps = makeDeps({ isPsiConfigured: vi.fn(() => true) })
    const { args, published } = makeArgs()

    await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(deps.fetchPageSpeedInsights).toHaveBeenCalledWith('https://example.com/', 'mobile')
    const psiCall = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'psi')
    expect(psiCall).toBeTruthy()
    expect(psiCall![0]).toMatchObject({ type: 'psi', claimLevel: 'L4', source: 'https://example.com/' })
    expect((psiCall![0].payload as { crux: { hasFieldData: boolean } }).crux.hasFieldData).toBe(true)
    expect(published.some((m) => (m as { data: { evidenceType?: string } }).data.evidenceType === 'psi')).toBe(true)
  })

  it('does not fail the run when PSI fetch throws (graceful degrade)', async () => {
    const deps = makeDeps({
      isPsiConfigured: vi.fn(() => true),
      fetchPageSpeedInsights: vi.fn(async () => { throw new Error('psi quota exceeded') }),
    })
    const { args } = makeArgs()

    const result = await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(result).toEqual({ status: 'collected' })
    expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'psi')).toBe(false)
    expect(deps.sendDiagnose).toHaveBeenCalled()
  })

  it('collects GSC keyword evidence + metrics when the project is connected', async () => {
    const deps = makeDeps({
      getProjectSettings: vi.fn(async () => ({
        gscConnected: true, gscRefreshToken: 'refresh_tok', gscSiteUrl: 'sc-domain:example.com',
        crawlEnabled: false, // 隔离：跳过全站爬取，聚焦 GSC 断言
      })),
      isGscPlatformConfigured: vi.fn(() => true),
    })
    const { args, published } = makeArgs()

    await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(deps.refreshGscAccessToken).toHaveBeenCalledWith('refresh_tok')
    // query 维 + page×query 交叉维两次查询
    expect(deps.querySearchAnalytics).toHaveBeenCalledTimes(2)
    const gscEv = deps.createEvidenceArtifact.mock.calls.filter((c) => c[0].type === 'gsc')
    expect(gscEv).toHaveLength(2)
    expect(gscEv.map((c) => (c[0].payload as { dimension: string }).dimension).sort()).toEqual(['query', 'queryPage'])
    gscEv.forEach((c) => expect(c[0].claimLevel).toBe('L4'))
    // keyword_metrics 落库：upsert 关键词后按 keywordId 建指标行
    expect(deps.upsertKeyword).toHaveBeenCalled()
    expect(deps.createKeywordMetrics).toHaveBeenCalled()
    const metricRows = deps.createKeywordMetrics.mock.calls[0][0]
    expect(metricRows[0].keywordId).toBe('kw_1')
    expect(published.some((m) => (m as { data: { evidenceType?: string } }).data.evidenceType === 'gsc')).toBe(true)
  })

  it('reuses the persisted GSC evidence id when Inngest replays that completed step', async () => {
    const deps = makeDeps({
      getProjectSettings: vi.fn(async () => ({
        gscConnected: true, gscRefreshToken: 'refresh_tok', gscSiteUrl: 'sc-domain:example.com', crawlEnabled: false,
      })),
      isGscPlatformConfigured: vi.fn(() => true),
    })
    const { args } = makeArgs({ cachedSteps: { 'persist-gsc-query': { evidenceId: 'ev_gsc_query_cached' } } })

    await collectEvidenceHandler(args, asCollectDeps(deps))

    const rows = deps.createKeywordMetrics.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0].evidenceId).toBe('ev_gsc_query_cached')
  })

  it('skips GSC collection when the project is not connected', async () => {
    const deps = makeDeps() // getProjectSettings → undefined
    const { args } = makeArgs()

    await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(deps.refreshGscAccessToken).not.toHaveBeenCalled()
    expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'gsc')).toBe(false)
    expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: 'gsc', configured: false, authorized: false, attempted: false, status: 'not_configured',
    }))
  })

  // AI 探针阶段挂在 render 之后、mark-collected 之前；providers/key 过滤在 stage 内部做，
  // handler 无条件调用（无可用 provider 时 stage 自行跳过）。
  it('runs the AI probe stage after render with the run context', async () => {
    const deps = makeDeps()
    const { args } = makeArgs()

    await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(deps.runProbes).toHaveBeenCalledOnce()
    const stageArgs = (deps.runProbes.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(stageArgs.runId).toBe('run_1')
    expect(stageArgs.projectId).toBe('proj_1')
    expect(typeof (stageArgs.step as { run: unknown }).run).toBe('function')
    // 探针失败已在 stage 内部兜底；handler 层面 run 仍然 collected
    expect(deps.markRunStatus).toHaveBeenCalledWith('run_1', 'collected', expect.anything())
    expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: 'ai_probe', status: 'not_configured', attempted: false,
    }))
  })

  it('marks AI probe coverage partial when only some attempted samples succeed', async () => {
    const deps = makeDeps({
      runProbes: vi.fn(async () => ({ probedProviders: ['openai'], promptCount: 2, attemptedCount: 4, successfulCount: 3 })),
    })
    const { args } = makeArgs()

    await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: 'ai_probe', status: 'partial', attempted: true, capturedEvidenceCount: 3,
      protocolSnapshot: expect.objectContaining({ attemptedSamples: 4, validSamples: 3 }),
    }))
  })

  it('skips render evidence when the render provider is not configured', async () => {
    const deps = makeDeps({
      renderProvider: {
        isConfigured: vi.fn(() => false),
        renderMainText: vi.fn(),
      },
    })
    const { args } = makeArgs()

    await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(deps.renderProvider.renderMainText).not.toHaveBeenCalled()
    const types = deps.createEvidenceArtifact.mock.calls.map((c) => c[0].type)
    // render 跳过后仍有 site_audit（爬取默认开启，审计块无条件产出快照）
    expect(types).toEqual(['page_fetch', 'schema', 'site_audit'])
    expect(deps.markRunStatus).toHaveBeenCalledWith(
      'run_1',
      'collected',
      expect.objectContaining({ failureReason: null, finishedAt: expect.any(String) }),
    )
    expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: 'render', status: 'partial', attempted: true,
      protocolSnapshot: expect.objectContaining({ mode: 'static_html_fallback' }),
    }))
  })

  it('short-circuits on SSRF-blocked URLs: marks failed, publishes failed, throws NonRetriableError', async () => {
    const deps = makeDeps({
      assertPublicUrl: vi.fn(async () => {
        throw new SsrfBlockedError('blocked private/reserved address: 10.0.0.5')
      }),
    })
    const { args, published } = makeArgs()

    await expect(collectEvidenceHandler(args, asCollectDeps(deps))).rejects.toThrow(NonRetriableError)

    expect(deps.fetchPageFacts).not.toHaveBeenCalled()
    expect(deps.createEvidenceArtifact).not.toHaveBeenCalled()
    expect(deps.markRunStatus).toHaveBeenCalledWith(
      'run_1',
      'failed',
      expect.objectContaining({
        failureReason: 'blocked private/reserved address: 10.0.0.5',
        finishedAt: expect.any(String),
      }),
    )
    expect(published.some((m) => (m as { data: { type: string } }).data.type === 'failed')).toBe(true)
  })

  it('crawlEnabled=false 时跳过爬取/聚类/审计，行为与旧单页流程一致', async () => {
    const deps = makeDeps({
      getProjectSettings: vi.fn(async () => ({ crawlEnabled: false, crawlMaxPages: 200, crawlMaxDepth: 3 })),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(deps.discoverSitemaps).not.toHaveBeenCalled()
    expect(deps.createEvidenceArtifact).toHaveBeenCalledTimes(3)
  })

  it('sitemap 文件逐个落 L4 evidence，爬取批次循环到 done 为止', async () => {
    let calls = 0
    const deps = makeDeps({
      discoverSitemaps: vi.fn(async () => ({
        files: [{ url: 'https://example.com/sitemap.xml', xml: '<urlset/>' }],
        pageUrls: ['https://example.com/a'],
        warnings: [],
      })),
      runCrawlBatch: vi.fn(async (state: unknown) => {
        calls++
        const s = state as Record<string, unknown>
        return { state: { ...s, frontier: [], checkedCount: calls, done: calls >= 2 }, results: [] }
      }),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(deps.runCrawlBatch).toHaveBeenCalledTimes(2)
    const sitemapEv = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'sitemap')
    expect(sitemapEv?.[0]).toMatchObject({ claimLevel: 'L4', source: 'https://example.com/sitemap.xml', rawText: '<urlset/>' })
  })

  it('深检目标 = 非入口代表页 + 重点页，证据带 sitePageId', async () => {
    const deps = makeDeps({
      getSitePages: vi.fn(async () => [
        { id: 'sp_1', url: 'https://example.com/', httpStatus: 200, checkStatus: 'checked', isKeyPage: false, templateId: null },
        { id: 'sp_2', url: 'https://example.com/p/1', httpStatus: 200, checkStatus: 'checked', isKeyPage: false, templateId: 'tpl_2' },
        { id: 'sp_3', url: 'https://example.com/key', httpStatus: 200, checkStatus: 'checked', isKeyPage: true, templateId: null },
      ]),
      getProjectTemplates: vi.fn(async () => [
        { id: 'tpl_2', projectId: 'proj_1', pattern: '/p/{id}', pageCount: 5, representativePageId: 'sp_2', source: 'heuristic' },
      ]),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    // 入口页 1 次 + 深检 2 个目标各 1 次
    expect(deps.fetchPageFacts).toHaveBeenCalledTimes(3)
    const deepFetches = deps.createEvidenceArtifact.mock.calls.filter(
      (c) => c[0].type === 'page_fetch' && c[0].sitePageId,
    )
    expect(deepFetches.map((c) => c[0].sitePageId).sort()).toEqual(['sp_2', 'sp_3'])
  })

  it('DataForSEO 已配置：收集种子词（探针检索式，去品牌）并调用 runDataforseo', async () => {
    const runDataforseo = vi.fn(async (args: unknown) => {
      void args
      return undefined
    })
    const deps = makeDeps({
      isDataforseoConfigured: vi.fn(() => true),
      runDataforseo,
      // 未连 GSC → 种子仅来自探针 prompt；'example ...' 为品牌词应被剔除。
      getRunPrompts: vi.fn(async () => [
        { id: 'p1', text: 'best crm software', priority: 0 },
        { id: 'p2', text: 'example brand pricing', priority: 1 },
      ]),
      getProject: vi.fn(async () => ({ id: 'proj_1', domain: 'example.com', industry: 'saas', market: 'de', language: 'de', competitors: [] })),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(runDataforseo).toHaveBeenCalledTimes(1)
    const stageArgs = runDataforseo.mock.calls[0][0] as { seeds: string[]; market: string; brand: string; competitorTopN: number }
    expect(stageArgs.seeds).toEqual(['best crm software']) // 品牌词 'example brand pricing' 被去掉
    expect(stageArgs.market).toBe('de')
    expect(stageArgs.brand).toBe('example')
  })

  it('GEO 采集器：落 ua_probe(L4) 与 third_party_presence(L3) 证据', async () => {
    const deps = makeDeps({
      collectUaProbe: vi.fn(async () => ({
        crawlers: [{ ua: 'PerplexityBot', kind: 'search' as const, url: 'https://example.com', status: 403, blocked: true }],
        llmsTxt: { exists: false, url: 'https://example.com/llms.txt' },
      })),
      checkThirdPartyPresence: vi.fn(async () => ({
        wikipedia: { exists: false, title: null, url: null },
        reddit: { mentions: 0, windowDays: 365 },
      })),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    const ua = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'ua_probe')
    const tp = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'third_party_presence')
    expect(ua).toBeTruthy()
    expect(ua![0].claimLevel).toBe('L4')
    expect(tp).toBeTruthy()
    expect(tp![0].claimLevel).toBe('L3')
  })

  // —— 社交/评价站前台存在度（social_presence）：复用同一 Google CSE 通道 ——
  describe('social_presence 采集段', () => {
    function socialDeps(overrides: Record<string, unknown> = {}) {
      return makeDeps({
        searchVisibilityProvider: {
          isConfigured: vi.fn(() => true),
          checkSite: vi.fn(),
          search: vi.fn(async (query: string) => ({
            query,
            totalResults: 1,
            resultCount: 1,
            results: [{ title: 't', link: 'https://youtube.com/x', snippet: 's' }],
            checkedAt: '2026-07-01T00:00:00.000Z',
          })),
        },
        ...overrides,
      })
    }

    it('CSE 已配置：落 social_presence(L2) 证据，source 为品牌名', async () => {
      const checkSocialPresence = vi.fn(async () => ({
        brand: 'example',
        platforms: [
          { platform: 'youtube', query: 'site:youtube.com "example"', resultCount: 1, topResults: [{ title: 't', url: 'https://youtube.com/x' }] },
        ],
        checkedAt: '2026-07-01T00:00:00.000Z',
      }))
      const deps = socialDeps({ checkSocialPresence })
      const { args } = makeArgs()

      await collectEvidenceHandler(args, asCollectDeps(deps))

      expect(checkSocialPresence).toHaveBeenCalledOnce()
      const sp = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'social_presence')
      expect(sp).toBeTruthy()
      expect(sp![0]).toMatchObject({ claimLevel: 'L2', source: 'example' })
      expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({
        sourceKey: 'social_presence', configured: true, authorized: true, attempted: true, status: 'collected', capturedEvidenceCount: 1,
      }))
    })

    it('CSE 未配置：跳过采集，不落证据，dss 记 not_configured', async () => {
      const checkSocialPresence = vi.fn(async () => { throw new Error('should not be called') })
      const deps = makeDeps({ checkSocialPresence }) // 默认 searchVisibilityProvider.isConfigured() === false
      const { args } = makeArgs()

      await collectEvidenceHandler(args, asCollectDeps(deps))

      expect(checkSocialPresence).not.toHaveBeenCalled()
      expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'social_presence')).toBe(false)
      expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({
        sourceKey: 'social_presence', configured: false, authorized: false, attempted: false, status: 'not_configured',
      }))
    })

    it('采集抛错：dss 记 failed，不落证据，且不阻断整轮采集', async () => {
      const checkSocialPresence = vi.fn(async () => { throw new Error('social_presence_boom') })
      const deps = socialDeps({ checkSocialPresence })
      const { args } = makeArgs()

      const result = await collectEvidenceHandler(args, asCollectDeps(deps))

      expect(result).toEqual({ status: 'collected' })
      expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'social_presence')).toBe(false)
      expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({
        sourceKey: 'social_presence', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: 'social_presence_boom',
      }))
      expect(deps.markRunStatus).toHaveBeenCalledWith('run_1', 'collected', expect.anything())
      expect(deps.sendDiagnose).toHaveBeenCalled()
    })
  })

  it('DataForSEO 未配置：跳过，不调用 runDataforseo', async () => {
    const runDataforseo = vi.fn(async () => undefined)
    const deps = makeDeps({ isDataforseoConfigured: vi.fn(() => false), runDataforseo })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(runDataforseo).not.toHaveBeenCalled()
  })

  // —— AIO（Google AI Overviews）实测采集：分引擎双口径的实测半边 ——
  describe('AIO 采集阶段', () => {
    function aioDeps(overrides: Record<string, unknown> = {}) {
      return makeDeps({
        getProjectSettings: vi.fn(async () => ({
          crawlEnabled: false, // 隔离：跳过全站爬取，聚焦 AIO 断言
          defaultModels: ['Google AI Overviews'],
          brandAliases: [],
        })),
        getProject: vi.fn(async () => ({
          id: 'proj_1', domain: 'example.com', industry: 'saas', market: 'English · Global', language: 'en', competitors: [],
        })),
        aioProvider: {
          isConfigured: vi.fn(() => true),
          fetchAioForKeyword: vi.fn(async (keyword: string) => ({
            keyword,
            aioPresent: true,
            asynchronous: false,
            answerMarkdown: '## summary',
            references: [{ domain: 'example.com', url: 'https://example.com/page', title: 't', source: 's', text: 'x' }],
          })),
        },
        createSerpAioResult: vi.fn(async () => undefined),
        ...overrides,
      })
    }

    function aioStatusCalls(deps: ReturnType<typeof aioDeps>) {
      return (deps.writeDataSourceStatus as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[0] as { sourceKey: string })
        .filter((c) => c.sourceKey === 'aio')
    }

    it('凭据未配置：整段跳过，不发起任何查询，不抛错', async () => {
      const deps = aioDeps({ aioProvider: { isConfigured: vi.fn(() => false), fetchAioForKeyword: vi.fn() } })
      const { args } = makeArgs()
      await expect(collectEvidenceHandler(args, asCollectDeps(deps))).resolves.toBeTruthy()
      expect((deps.aioProvider as { fetchAioForKeyword: ReturnType<typeof vi.fn> }).fetchAioForKeyword).not.toHaveBeenCalled()
      expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'serp_aio')).toBe(false)
      expect(aioStatusCalls(deps)).toEqual([
        expect.objectContaining({ sourceKey: 'aio', configured: false, status: 'not_configured' }),
      ])
    })

    it('凭据已配置但 run 未勾选 Google AI Overviews：跳过', async () => {
      const deps = aioDeps({
        getProjectSettings: vi.fn(async () => ({ crawlEnabled: false, defaultModels: ['ChatGPT'], brandAliases: [] })),
      })
      const { args } = makeArgs()
      await collectEvidenceHandler(args, asCollectDeps(deps))
      expect((deps.aioProvider as { fetchAioForKeyword: ReturnType<typeof vi.fn> }).fetchAioForKeyword).not.toHaveBeenCalled()
      expect(aioStatusCalls(deps)).toEqual([
        expect.objectContaining({ sourceKey: 'aio', configured: true, status: 'not_attempted' }),
      ])
    })

    it('市场未映射（如"东南亚"）：不猜默认国家，整块标记未尝试', async () => {
      const deps = aioDeps({
        getProject: vi.fn(async () => ({
          id: 'proj_1', domain: 'example.com', industry: 'saas', market: '东南亚', language: 'en', competitors: [],
        })),
      })
      const { args } = makeArgs()
      await collectEvidenceHandler(args, asCollectDeps(deps))
      expect((deps.aioProvider as { fetchAioForKeyword: ReturnType<typeof vi.fn> }).fetchAioForKeyword).not.toHaveBeenCalled()
      const calls = aioStatusCalls(deps)
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ status: 'not_attempted' })
      expect((calls[0] as { protocolSnapshot?: { reason?: string } }).protocolSnapshot).toMatchObject({ reason: 'market_not_mapped', market: '东南亚' })
    })

    it('已配置 + 已勾选 + 市场已映射：对 30 条确定性查询逐一采集，落 evidence + serp_aio_results', async () => {
      const deps = aioDeps()
      const { args } = makeArgs()
      await collectEvidenceHandler(args, asCollectDeps(deps))

      const fetchMock = (deps.aioProvider as { fetchAioForKeyword: ReturnType<typeof vi.fn> }).fetchAioForKeyword
      expect(fetchMock).toHaveBeenCalledTimes(30)
      // location/language 映射：English · Global → en-US（2840/en）
      expect(fetchMock.mock.calls[0][1]).toEqual({ locationCode: 2840, languageCode: 'en' })

      const aioEvidence = deps.createEvidenceArtifact.mock.calls.filter((c) => c[0].type === 'serp_aio')
      expect(aioEvidence).toHaveLength(30)
      aioEvidence.forEach((c) => expect(c[0].claimLevel).toBe('L3'))

      expect(deps.createSerpAioResult).toHaveBeenCalledTimes(30)
      const firstResultRow = (deps.createSerpAioResult as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        aioPresent: boolean; targetDomainCited: boolean; citedUrls: string[]; locationCode: number; languageCode: string
      }
      expect(firstResultRow.aioPresent).toBe(true)
      expect(firstResultRow.targetDomainCited).toBe(true) // references 命中 example.com（自有域名）
      expect(firstResultRow.citedUrls).toEqual(['https://example.com/page'])
      expect(firstResultRow.locationCode).toBe(2840)
      expect(firstResultRow.languageCode).toBe('en')

      const calls = aioStatusCalls(deps)
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ status: 'collected', capturedEvidenceCount: 30 })
    })

    it('单条查询失败不阻断其余查询：失败留证据现场，不写 serp_aio_results', async () => {
      let call = 0
      const deps = aioDeps({
        aioProvider: {
          isConfigured: vi.fn(() => true),
          fetchAioForKeyword: vi.fn(async (keyword: string) => {
            call++
            if (call === 2) throw new Error('dataforseo_error_40001')
            return {
              keyword,
              aioPresent: false,
              asynchronous: false,
              answerMarkdown: null,
              references: [],
            }
          }),
        },
      })
      const { args } = makeArgs()
      await collectEvidenceHandler(args, asCollectDeps(deps))

      const aioEvidence = deps.createEvidenceArtifact.mock.calls.filter((c) => c[0].type === 'serp_aio')
      expect(aioEvidence).toHaveLength(30) // 29 成功 + 1 失败，均落证据现场
      const failedEvidence = aioEvidence.find((c) => (c[0].request as { error_code?: string })?.error_code)
      expect(failedEvidence).toBeTruthy()
      expect(failedEvidence![0].payload).toBeNull()

      expect(deps.createSerpAioResult).toHaveBeenCalledTimes(29) // 失败那条不写结果表
      const calls = aioStatusCalls(deps)
      expect(calls[0]).toMatchObject({ status: 'partial', capturedEvidenceCount: 29 })
    })
  })
})
