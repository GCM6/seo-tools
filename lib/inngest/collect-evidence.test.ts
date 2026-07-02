import { describe, it, expect, vi } from 'vitest'
import { NonRetriableError } from 'inngest'
import { collectEvidenceHandler } from './collect-evidence'
import { SsrfBlockedError } from '@/lib/security/ssrf-guard'
import type { NewEvidenceArtifact } from '@/lib/repositories'

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
    extractSchema: vi.fn(() => ({ types: ['Organization'], raw: [{ '@type': 'Organization' }] })),
    renderProvider: {
      renderMainText: vi.fn(async () => ({ html: '<html>rendered</html>', mainTextChars: 400 })),
    },
    searchVisibilityProvider: {
      isConfigured: vi.fn(() => false),
      checkSite: vi.fn(),
    },
    createEvidenceArtifact: vi.fn(async (input: NewEvidenceArtifact) => [input]),
    markRunStatus: vi.fn(async () => undefined),
    runProbes: vi.fn(async () => ({ probedProviders: [], promptCount: 0 })),
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
    ...overrides,
  }
}

// deps 保留 vi.fn() 的 Mock 类型（断言里要用 .mock.calls），只在传给
// collectEvidenceHandler 时转成它期望的 CollectDeps 形状。
function asCollectDeps(deps: ReturnType<typeof makeDeps>): Parameters<typeof collectEvidenceHandler>[1] {
  return deps as unknown as Parameters<typeof collectEvidenceHandler>[1]
}

function makeArgs() {
  const published: unknown[] = []
  return {
    args: {
      event: { data: { runId: 'run_1', projectId: 'proj_1', url: 'https://example.com' } },
      // 复刻 Inngest 真实行为：step.run 的返回值经 JSON 序列化往返落库再回放，
      // URL / Date 等富对象会退化成字符串（URL.toJSON() → href）。用直通 fn() 的假
      // step 会漏掉这一层，导致「validUrl 实为 string、.hostname 为 undefined」的线上崩溃测不出来。
      step: {
        run: async <T,>(_id: string, fn: () => Promise<T> | T): Promise<T> => {
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
})
