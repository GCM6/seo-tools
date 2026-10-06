// collectEvidenceHandler 的测试依赖工厂（从 lib/inngest/collect-evidence.test.ts 原样迁出，供失败矩阵等测试复用）。
// 默认值保持原样：多数采集块默认关闭（未配置 / 抛错降级），专门用例用 overrides 打开。
import { vi } from 'vitest'
import { okResult } from '@/lib/collection/result'
import type { NewEvidenceArtifact } from '@/lib/repositories'
import type { collectEvidenceHandler } from '@/lib/inngest/collect-evidence'

export function makeDeps(overrides: Record<string, unknown> = {}) {
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
    fetchPageSpeedInsights: vi.fn(async () => okResult({
      strategy: 'mobile' as const,
      crux: { lcpMs: 4200, inpMs: 120, cls: 0.2, hasFieldData: true },
      lighthouse: { performanceScore: 40, opportunities: [{ id: 'a', title: '压缩图片', savingsMs: 800 }], ttfbMs: 1500 },
    }, { status: 200, contentType: 'application/json; charset=UTF-8', body: '{"lighthouseResult":{}}' })),
    // 原始响应存档（SP-A §4.3）
    createEvidenceRaw: vi.fn(async (row: unknown) => { void row }),
    linkEvidenceRaw: vi.fn(async (ids: string[], evidenceId: string) => { void ids; void evidenceId }),
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
          linkDetails: [], externalLinks: [],
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
    // 本 run 见过的页（spec S1 §5）：图谱与 site_audit 只读它。
    getRunSitePages: vi.fn(async () => [
      {
        id: 'sp_1', projectId: 'proj_1', url: 'https://example.com/', discoveredVia: 'entry', depth: 0,
        httpStatus: 200, finalUrl: null, title: 'home', canonicalUrl: null, metaRobots: null,
        mainTextChars: 2, contentHash: 'h', inboundLinkCount: 0, checkStatus: 'checked',
        errorReason: null, templateId: null, isKeyPage: false, lastSeenRunId: 'run_1',
        linkDetails: [], externalLinks: [],
      },
    ]),
    updateInboundCounts: vi.fn(async () => undefined),
    // 站外链接抽检（spec S2 §4）：默认全部 200。
    checkExternalLinks: vi.fn(async (targets: { url: string; href?: string }[]) => targets.map((t) => ({ url: t.url, status: 200, error: null }))),
    // 取消守卫（第二轮独立审查 #1）：写库前确认 run 未被用户取消。
    getRun: vi.fn(async () => ({ id: 'run_1', status: 'collecting', failureReason: null })),
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
    resolveDataforseo: vi.fn(async () => null),
    // 种子来源默认为空（专门用例里按 projectId 返回）。
    getTargetKeywords: vi.fn(async () => [] as string[]),
    getGscKeywordHistory: vi.fn(async () => [] as { keyText: string; lastSeenAt: string }[]),
    runDataforseo: vi.fn(async () => []),
    // AIO（Google AI Overviews）默认未配置，采集块整体跳过；专门用例里再启用。
    aioProvider: { isConfigured: vi.fn(() => false), fetchAioForKeyword: vi.fn() },
    createSerpAioResult: vi.fn(async () => undefined),
    getRunPrompts: vi.fn(async () => []),
    getRunSerpAioResults: vi.fn(async () => []),
    getProject: vi.fn(async () => ({ id: 'proj_1', domain: 'example.com', industry: '', market: 'US', language: 'en', competitors: [] })),
    sendDiagnose: vi.fn(async () => undefined),
    writeDataSourceStatus: vi.fn(async () => undefined),
    ...overrides,
  }
}

// deps 保留 vi.fn() 的 Mock 类型（断言里要用 .mock.calls），只在传给
// collectEvidenceHandler 时转成它期望的 CollectDeps 形状。
export function asCollectDeps(deps: ReturnType<typeof makeDeps>): Parameters<typeof collectEvidenceHandler>[1] {
  return deps as unknown as Parameters<typeof collectEvidenceHandler>[1]
}

export function makeArgs(options: { cachedSteps?: Record<string, unknown> } = {}) {
  const published: unknown[] = []
  // 记录每个 step 的（序列化后）返回值：S1 断言大载荷不跨 step 边界（spec S1 §7）。
  const stepOutputs: Record<string, unknown> = {}
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
          const replayed = out === undefined ? undefined : JSON.parse(JSON.stringify(out))
          stepOutputs[id] = replayed
          return replayed as T
        },
      },
      publish: async (msg: unknown) => {
        published.push(msg)
      },
    },
    published,
    stepOutputs,
  }
}
