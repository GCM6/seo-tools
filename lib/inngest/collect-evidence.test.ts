import { describe, it, expect, vi } from 'vitest'
import { failResult } from '@/lib/collection/result'
import { PSI_429_QUOTA_BODY, REDDIT_403 } from '@/lib/test-fixtures/real-shapes'
import type { ThirdPartyOutcome, WikipediaCheck, RedditCheck } from '@/lib/collection/third-party-presence'

// DataForSEO 凭据已解析（SP-A §4.6）：provider + 原文缓冲区。
const dfsResolved = () => ({ provider: { isConfigured: () => true } as never, drainRaws: () => [] })

// 第三方采集器 v2 结果（SP-A §4.4）：两路各自 ok/failed，带原文。
const wikiOkNone: WikipediaCheck = { status: 'ok', exists: false, title: null, url: null }
const redditOk = (mentions: number): RedditCheck => ({ status: 'ok', mentions, windowDays: 365 })
const redditFailed: RedditCheck = { status: 'failed', httpStatus: 403, reason: 'http_403', windowDays: 365 }
const tpOutcome = (wikipedia: WikipediaCheck, reddit: RedditCheck): ThirdPartyOutcome => ({
  payload: { version: 2, candidates: ['Example'], wikipedia, reddit },
  raws: [
    { source: 'wikipedia', raw: { status: wikipedia.status === 'ok' ? 200 : 503, contentType: 'application/json; charset=utf-8', body: '{"batchcomplete":true}' } },
    { source: 'reddit', raw: reddit.status === 'ok' ? { status: 200, contentType: 'application/json', body: '{"data":{"children":[]}}' } : { status: REDDIT_403.status, contentType: REDDIT_403.contentType, body: REDDIT_403.bodyPrefix } },
  ],
})
import { NonRetriableError } from 'inngest'
import { collectEvidenceHandler } from './collect-evidence'
import { SsrfBlockedError } from '@/lib/security/ssrf-guard'
import { makeDeps, makeArgs, asCollectDeps } from '@/lib/test-fixtures/collect-evidence-deps'
import { GscAuthExpiredError } from '@/lib/gsc/oauth'
import { createBrowserlessRenderProvider } from '@/lib/render/browserless-provider'


describe('collectEvidenceHandler', () => {
  it('修复波 2：run 已被用户取消 → 抓取 step 写库前中止，不抢占新 run 的行（第二轮独立审查 #1）', async () => {
    const deps = makeDeps({ getRun: vi.fn(async () => ({ id: 'run_1', status: 'failed', failureReason: 'cancelled_by_user' })) })
    const { args } = makeArgs()
    await expect(collectEvidenceHandler(args, asCollectDeps(deps))).rejects.toThrow('run_cancelled')
    expect(deps.upsertSitePages).not.toHaveBeenCalled()
  })

  it('修复波 2：单批站外抽检失败 → 该批记 not_checked，run 继续（第二轮独立审查 #9）', async () => {
    const externalLinks = Array.from({ length: 3 }, (_, i) => ({ url: `https://e${i}.com/p`, host: `e${i}.com`, anchor: 'a', region: 'main', rel: [] }))
    const deps = makeDeps({
      getRunSitePages: vi.fn(async () => [{
        id: 'sp_1', projectId: 'proj_1', url: 'https://example.com/', discoveredVia: 'entry', depth: 0, httpStatus: 200, finalUrl: null,
        title: 'home', canonicalUrl: null, metaRobots: null, mainTextChars: 2, contentHash: 'h', inboundLinkCount: 0, checkStatus: 'checked',
        errorReason: null, templateId: null, isKeyPage: false, lastSeenRunId: 'run_1', linkDetails: [], externalLinks, lightCheckExtra: { contentKind: 'html' },
      }]),
      checkExternalLinks: vi.fn(async () => { throw new Error('function timeout') }),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    const audit = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'site_audit')?.[0]
    const payload = audit?.payload as { externalChecks: { error: string }[]; protocol: { externalCheck: { failedBatches: number } } }
    expect(payload.externalChecks.map((c) => c.error)).toEqual(['not_checked', 'not_checked', 'not_checked'])
    expect(payload.protocol.externalCheck.failedBatches).toBe(1)
  })

  it('修复波 2：sitemap 原始地址透传给爬虫状态（第二轮独立审查 #6）', async () => {
    const deps = makeDeps({
      discoverSitemaps: vi.fn(async () => ({ files: [], pageUrls: ['https://example.com/a'], fetchUrls: { 'https://example.com/a': 'https://example.com/a/' }, warnings: [] })),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect((deps.runCrawlBatch.mock.calls[0][0] as { fetchUrls: Record<string, string> }).fetchUrls).toEqual({ 'https://example.com/a': 'https://example.com/a/' })
  })

  it('S2：站外链接按 25 个一批抽检，结果与协议写入 site_audit', async () => {
    const externalLinks = Array.from({ length: 30 }, (_, i) => ({ url: `https://ext${i}.com/p`, host: `ext${i}.com`, anchor: 'a', region: 'main', rel: [] }))
    const deps = makeDeps({
      getRunSitePages: vi.fn(async () => [
        {
          id: 'sp_1', projectId: 'proj_1', url: 'https://example.com/', discoveredVia: 'entry', depth: 0,
          httpStatus: 200, finalUrl: null, title: 'home', canonicalUrl: null, metaRobots: null,
          mainTextChars: 2, contentHash: 'h', inboundLinkCount: 0, checkStatus: 'checked',
          errorReason: null, templateId: null, isKeyPage: false, lastSeenRunId: 'run_1',
          linkDetails: [], externalLinks, lightCheckExtra: { contentKind: 'html' },
        },
      ]),
      checkExternalLinks: vi.fn(async (targets: { url: string }[]) => targets.map((t) => ({ url: t.url, status: t.url.includes('ext3.') ? 404 : 200, error: null }))),
    })
    const { args, stepOutputs } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(deps.checkExternalLinks.mock.calls.map((c) => (c[0] as unknown[]).length)).toEqual([25, 5])
    expect(stepOutputs).toHaveProperty('check-external-links-0')
    expect(stepOutputs).toHaveProperty('check-external-links-1')
    const audit = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'site_audit')?.[0]
    const payload = audit?.payload as { externalChecks: { url: string; status: number }[]; protocol: { externalCheck: unknown } }
    expect(payload.externalChecks).toHaveLength(30)
    expect(payload.externalChecks.find((c) => c.url === 'https://ext3.com/p')?.status).toBe(404)
    expect(payload.protocol.externalCheck).toEqual({ cap: 100, checked: 30, skippedUrls: 0, failedBatches: 0 })
  })

  it('S2：没有站外链接时不发抽检请求，协议记 checked=0', async () => {
    const deps = makeDeps()
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(deps.checkExternalLinks).not.toHaveBeenCalled()
    const audit = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'site_audit')?.[0]
    expect((audit?.payload as { protocol: { externalCheck: unknown } }).protocol.externalCheck).toEqual({ cap: 100, checked: 0, skippedUrls: 0, failedBatches: 0 })
  })

  it('S1：抓取 step 内落库且返回值不含抓取结果；审计 step 只返回引用；site_audit 带 linkGraph 与抓取策略', async () => {
    const deps = makeDeps()
    const { args, stepOutputs } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(Object.keys(stepOutputs['crawl-v2-batch-0'] as object).sort()).toEqual(['resultCount', 'state'])
    expect(stepOutputs).not.toHaveProperty('persist-crawl-batch-0')
    expect(stepOutputs).not.toHaveProperty('persist-site-audit')
    expect(deps.upsertSitePages).toHaveBeenCalledWith('proj_1', 'run_1', expect.arrayContaining([expect.objectContaining({ linkDetails: [], externalLinks: [] })]))
    expect(deps.updateInboundCounts).toHaveBeenCalledWith('proj_1', 'run_1', { 'https://example.com/': 0 })
    expect(deps.getRunSitePages).toHaveBeenCalledWith('proj_1', 'run_1')
    expect(Object.keys(stepOutputs['build-site-audit-v2'] as object).sort()).toEqual(['evidenceId', 'payloadBytes'])
    const audit = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'site_audit')?.[0]
    expect(audit?.payload).toMatchObject({ protocol: { crawlStrategy: 'link_first_v1', sitemapReserveRatio: 0.2 }, linkGraph: { version: 2 } })
    expect(audit?.id).toBe((stepOutputs['build-site-audit-v2'] as { evidenceId: string }).evidenceId)
    const crawlDss = (deps.writeDataSourceStatus.mock.calls as unknown as [{ sourceKey: string; protocolSnapshot?: Record<string, unknown> }][]).map((c) => c[0]).find((d) => d.sourceKey === 'crawl')
    expect(crawlDss?.protocolSnapshot).toMatchObject({ crawlStrategy: 'link_first_v1', sitemapReserveRatio: 0.2 })
  })

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
    // 原文先以无 evidence_id 落库（与取数同一 step），证据写好后再挂上。
    const rawRow = deps.createEvidenceRaw.mock.calls.find((c) => (c[0] as { sourceKey: string }).sourceKey === 'psi')![0] as { id: string; evidenceId: string | null; httpStatus: number }
    expect(rawRow).toMatchObject({ evidenceId: null, httpStatus: 200 })
    expect(deps.linkEvidenceRaw).toHaveBeenCalledWith([rawRow.id], psiCall![0].id)
    expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({ sourceKey: 'psi', status: 'collected', capturedEvidenceCount: 1 }))
  })

  it('PSI 429：不写 psi 证据，状态 failed 带 http_429，原文照样存档（不挂证据）', async () => {
    const deps = makeDeps({
      isPsiConfigured: vi.fn(() => true),
      fetchPageSpeedInsights: vi.fn(async () => failResult('http_429', 429, { status: 429, contentType: 'application/json; charset=UTF-8', body: PSI_429_QUOTA_BODY })),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'psi')).toBe(false)
    expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({ sourceKey: 'psi', status: 'failed', failureReason: 'http_429' }))
    const rawCalls = deps.createEvidenceRaw.mock.calls.filter((c) => (c[0] as { sourceKey: string }).sourceKey === 'psi')
    expect(rawCalls).toHaveLength(1)
    expect(rawCalls[0][0]).toMatchObject({ evidenceId: null, httpStatus: 429, encoding: 'gzip', truncated: false })
    expect(deps.linkEvidenceRaw.mock.calls.length).toBe(0)
  })

  it('PSI 网络错误（无原文）：状态 failed 带 network_error，不写原文', async () => {
    const deps = makeDeps({ isPsiConfigured: vi.fn(() => true), fetchPageSpeedInsights: vi.fn(async () => failResult('network_error')) })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({ sourceKey: 'psi', status: 'failed', failureReason: 'network_error' }))
    expect(deps.createEvidenceRaw.mock.calls.some((c) => (c[0] as { sourceKey: string }).sourceKey === 'psi')).toBe(false)
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

  it('GSC 授权失效（invalid_grant）→ step 内抛 NonRetriableError（Inngest 不再退避重试），状态记 failed、原因不变（验收新发现 2）', async () => {
    const deps = makeDeps({
      getProjectSettings: vi.fn(async () => ({
        gscConnected: true, gscRefreshToken: 'refresh_tok', gscSiteUrl: 'sc-domain:example.com', crawlEnabled: false,
      })),
      isGscPlatformConfigured: vi.fn(() => true),
      refreshGscAccessToken: vi.fn(async () => { throw new GscAuthExpiredError('gsc token refresh failed: 400 invalid_grant') }),
    })
    const { args } = makeArgs()
    const stepErrors: { id: string; err: unknown }[] = []
    const run = args.step.run
    args.step.run = (<T,>(id: string, fn: () => Promise<T> | T) =>
      run(id, async () => {
        try {
          return await fn()
        } catch (err) {
          stepErrors.push({ id, err })
          throw err
        }
      })) as typeof args.step.run
    await collectEvidenceHandler(args, asCollectDeps(deps))
    const gscErr = stepErrors.find((e) => e.id === 'gsc-query')?.err
    expect(gscErr).toBeInstanceOf(NonRetriableError)
    expect((gscErr as Error).message).toBe('gsc token refresh failed: 400 invalid_grant')
    expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({ sourceKey: 'gsc', status: 'failed', failureReason: 'gsc token refresh failed: 400 invalid_grant' }))
  })

  it('GSC 换 token 遇到暂时性错误（网络等）→ 照常抛原错误，交给 Inngest 重试', async () => {
    const deps = makeDeps({
      getProjectSettings: vi.fn(async () => ({
        gscConnected: true, gscRefreshToken: 'refresh_tok', gscSiteUrl: 'sc-domain:example.com', crawlEnabled: false,
      })),
      isGscPlatformConfigured: vi.fn(() => true),
      refreshGscAccessToken: vi.fn(async () => { throw new TypeError('fetch failed') }),
    })
    const { args } = makeArgs()
    const stepErrors: { id: string; err: unknown }[] = []
    const run = args.step.run
    args.step.run = (<T,>(id: string, fn: () => Promise<T> | T) =>
      run(id, async () => {
        try {
          return await fn()
        } catch (err) {
          stepErrors.push({ id, err })
          throw err
        }
      })) as typeof args.step.run
    await collectEvidenceHandler(args, asCollectDeps(deps))
    const gscErr = stepErrors.find((e) => e.id === 'gsc-query')?.err
    expect(gscErr).toBeInstanceOf(TypeError)
    expect(gscErr).not.toBeInstanceOf(NonRetriableError)
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

  describe('市场单一真源接线（SP-A §3.1）', () => {
    function gscDeps(market: string, language = 'en') {
      return makeDeps({
        getProjectSettings: vi.fn(async () => ({
          gscConnected: true, gscRefreshToken: 'refresh_tok', gscSiteUrl: 'sc-domain:example.com', crawlEnabled: false,
        })),
        isGscPlatformConfigured: vi.fn(() => true),
        getProject: vi.fn(async () => ({ id: 'proj_1', domain: 'example.com', industry: 'saas tool', market, language, competitors: [] })),
      })
    }

    it('GSC 两次查询都按市场国家过滤：gb → gbr', async () => {
      const deps = gscDeps('gb')
      await collectEvidenceHandler(makeArgs().args, asCollectDeps(deps))
      const countries = deps.querySearchAnalytics.mock.calls.map((c) => ((c as unknown[])[2] as { country?: string | null }).country)
      expect(countries).toEqual(['gbr', 'gbr'])
    })

    it('全球英文不按国家过滤', async () => {
      const deps = gscDeps('global-en')
      await collectEvidenceHandler(makeArgs().args, asCollectDeps(deps))
      const countries = deps.querySearchAnalytics.mock.calls.map((c) => ((c as unknown[])[2] as { country?: string | null }).country)
      expect(countries).toEqual([null, null])
    })

    it('GSC 关键词按项目市场 code 入库，语言恒为 en', async () => {
      const deps = gscDeps('gb')
      await collectEvidenceHandler(makeArgs().args, asCollectDeps(deps))
      expect(deps.upsertKeyword.mock.calls[0][0]).toMatchObject({ market: 'gb', language: 'en', source: 'gsc' })
    })
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
  it('回测事件带 baselineRunId → 透传给探针阶段（复用基线问句集，第一波审查 I4）', async () => {
    const deps = makeDeps()
    const { args } = makeArgs()
    args.event.data = { ...args.event.data, baselineRunId: 'run_base' } as typeof args.event.data
    await collectEvidenceHandler(args, asCollectDeps(deps))
    const stageArgs = (deps.runProbes.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(stageArgs.baselineRunId).toBe('run_base')
  })

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
    expect(stageArgs.baselineRunId).toBeUndefined()
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
    // 没有托管浏览器：如实记"未配置、未尝试"（不是"部分采集"），快照说明本轮只有静态 HTML 兜底（验收新发现 4）。
    expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: 'render', status: 'not_configured', configured: false, attempted: false,
      protocolSnapshot: expect.objectContaining({ mode: 'static_html_fallback', evidence: ['page_fetch'] }),
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

  it('DataForSEO 已配置：种子按 manual → 历史 GSC → 站点短语收集（不再用探针问句），带来源标签、去品牌（SP-A §3.3）', async () => {
    const runDataforseo = vi.fn(async (args: unknown) => {
      void args
      return []
    })
    const page = (id: string, url: string, title: string) => ({
      id, projectId: 'proj_1', url, discoveredVia: 'crawl', depth: 1,
      httpStatus: 200, finalUrl: null, title, canonicalUrl: null, metaRobots: null,
      mainTextChars: 2, contentHash: id, inboundLinkCount: 1, checkStatus: 'checked',
      errorReason: null, templateId: null, isKeyPage: false, lastSeenRunId: 'run_1',
      linkDetails: [], externalLinks: [],
    })
    const deps = makeDeps({
      resolveDataforseo: vi.fn(async () => dfsResolved()),
      runDataforseo,
      // 探针问句即使存在也不得进入种子。
      getRunPrompts: vi.fn(async () => [{ id: 'p1', text: 'What are the best products or services for saas?', priority: 0 }]),
      getTargetKeywords: vi.fn(async (projectId: string) => (projectId === 'proj_1' ? ['remove pdf metadata', 'example brand pricing'] : [])),
      getGscKeywordHistory: vi.fn(async (projectId: string) => (projectId === 'proj_1' ? [{ keyText: 'remove author from word', lastSeenAt: '2026-07-13T07:05:02.556Z' }] : [])),
      // 入参敏感：只有 (projectId, runId) 都对才返回页面——防止调用参数写错时种子静默变空。
      getRunSitePages: vi.fn(async (projectId: string, runId: string) =>
        projectId === 'proj_1' && runId === 'run_1'
          ? [
              page('sp_1', 'https://example.com/', 'Example'),
              page('sp_2', 'https://example.com/clean', 'Clean Document Metadata | Example'),
              page('sp_3', 'https://example.com/privacy', 'Privacy Policy | Example'),
            ]
          : []),
      getProject: vi.fn(async () => ({ id: 'proj_1', domain: 'example.com', industry: 'saas tool', market: 'gb', language: 'en', competitors: [] })),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))

    expect(runDataforseo).toHaveBeenCalledTimes(1)
    const stageArgs = runDataforseo.mock.calls[0][0] as { seeds: { text: string; source: string; lastSeenAt?: string }[]; market: string; brand: string }
    expect(stageArgs.seeds).toEqual([
      { text: 'remove pdf metadata', source: 'manual' },
      { text: 'remove author from word', source: 'gsc_history', lastSeenAt: '2026-07-13T07:05:02.556Z' },
      { text: 'clean document metadata', source: 'site_phrase' },
    ])
    expect(stageArgs.market).toBe('gb')
    expect(stageArgs.brand).toBe('example')
  })

  it('DataForSEO 子阶段：逐个写 dataforseo:<子阶段> 状态，父级按子阶段汇总（不再无条件 collected）', async () => {
    const runDataforseo = vi.fn(async (args: { persistRaws: (stage: string, raws: unknown[]) => Promise<string[]> }) => {
      await args.persistRaws('labs', [{ status: 200, contentType: 'application/json', body: '{}' }])
      return [
        { stage: 'seed_serp', status: 'not_attempted', reason: 'no_seeds', evidenceCount: 0 },
        { stage: 'labs', status: 'not_attempted', reason: 'no_seeds', evidenceCount: 0 },
        { stage: 'backlinks', status: 'failed', reason: 'http_402', evidenceCount: 0 },
        { stage: 'bing_index', status: 'collected', reason: null, evidenceCount: 1 },
        { stage: 'brand_serp', status: 'collected', reason: null, evidenceCount: 1 },
      ]
    })
    const deps = makeDeps({ resolveDataforseo: vi.fn(async () => dfsResolved()), runDataforseo })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    const dss = deps.writeDataSourceStatus.mock.calls.map((c) => (c as unknown[])[0] as { sourceKey: string; status: string; attempted: boolean; failureReason?: string | null; capturedEvidenceCount?: number; protocolSnapshot?: { reason?: string } })
    const of = (k: string) => dss.find((r) => r.sourceKey === k)
    expect(of('dataforseo:seed_serp')).toMatchObject({ status: 'not_attempted', attempted: false, protocolSnapshot: { reason: 'no_seeds' } })
    expect(of('dataforseo:backlinks')).toMatchObject({ status: 'failed', attempted: true, failureReason: 'http_402' })
    expect(of('dataforseo:bing_index')).toMatchObject({ status: 'collected', capturedEvidenceCount: 1 })
    expect(of('dataforseo')).toMatchObject({ status: 'partial', attempted: true, capturedEvidenceCount: 2 })
    // persistRaws 由编排层接到 evidence_raw，sourceKey 为 dataforseo:<子阶段>
    expect(deps.createEvidenceRaw.mock.calls.map((c) => (c[0] as { sourceKey: string }).sourceKey)).toContain('dataforseo:labs')
  })

  it('DataForSEO 子阶段全部失败 → 父级 failed 且写明各子阶段原因（与第三方 / 社媒父级同一格式；报告按父级展示）', async () => {
    const runDataforseo = vi.fn(async () =>
      ['seed_serp', 'labs', 'backlinks', 'bing_index', 'brand_serp'].map((stage) => ({ stage, status: 'failed', reason: 'http_402', evidenceCount: 0 })),
    )
    const deps = makeDeps({ resolveDataforseo: vi.fn(async () => dfsResolved()), runDataforseo })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    const parent = deps.writeDataSourceStatus.mock.calls.map((c) => (c as unknown[])[0] as { sourceKey: string }).find((r) => r.sourceKey === 'dataforseo')
    expect(parent).toMatchObject({
      status: 'failed',
      failureReason: 'seed_serp=http_402, labs=http_402, backlinks=http_402, bing_index=http_402, brand_serp=http_402',
    })
  })

  it('DataForSEO 种子：站点短语同时取深检页的 H1（spec §3.3）', async () => {
    const runDataforseo = vi.fn(async (args: unknown) => { void args; return [] })
    const deps = makeDeps({
      resolveDataforseo: vi.fn(async () => dfsResolved()),
      runDataforseo,
      getSitePages: vi.fn(async () => [
        { id: 'sp_1', url: 'https://example.com/', httpStatus: 200, checkStatus: 'checked', isKeyPage: false, templateId: null },
        { id: 'sp_3', url: 'https://example.com/key', httpStatus: 200, checkStatus: 'checked', isKeyPage: true, templateId: null },
      ]),
      fetchPageFacts: vi.fn(async (url: string) => ({
        rawHtml: url === 'https://example.com/key' ? '<html><body><h1>Strip EXIF Data Online</h1></body></html>' : '<html><body>hi</body></html>',
        mainTextChars: 2, canonicalUrl: url, metaRobots: 'index,follow',
      })),
      getProject: vi.fn(async () => ({ id: 'proj_1', domain: 'example.com', industry: 'saas tool', market: 'gb', language: 'en', competitors: [] })),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    const stageArgs = runDataforseo.mock.calls[0][0] as { seeds: { text: string; source: string }[] }
    expect(stageArgs.seeds).toContainEqual({ text: 'strip exif data online', source: 'site_phrase' })
  })

  it('UA 探测每个请求都失败（status 全为 null）→ 记 failed，不写 ua_probe 证据（第二波审查 I2）', async () => {
    const deps = makeDeps({
      collectUaProbe: vi.fn(async () => ({
        crawlers: [
          { ua: 'GPTBot', kind: 'training' as const, url: 'https://example.com/', status: null, blocked: false },
          { ua: 'OAI-SearchBot', kind: 'search' as const, url: 'https://example.com/', status: null, blocked: false },
        ],
        llmsTxt: { exists: false, url: 'https://example.com/llms.txt' },
      })),
    })
    const { args } = makeArgs()
    await collectEvidenceHandler(args, asCollectDeps(deps))
    expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'ua_probe')).toBe(false)
    expect(deps.writeDataSourceStatus).toHaveBeenCalledWith(expect.objectContaining({ sourceKey: 'ua_probe', status: 'failed', failureReason: 'all_requests_failed' }))
  })

  it('GEO 采集器：落 ua_probe(L4) 与 third_party_presence(L3) 证据', async () => {
    const deps = makeDeps({
      collectUaProbe: vi.fn(async () => ({
        crawlers: [{ ua: 'PerplexityBot', kind: 'search' as const, url: 'https://example.com', status: 403, blocked: true }],
        llmsTxt: { exists: false, url: 'https://example.com/llms.txt' },
      })),
      checkThirdPartyPresence: vi.fn(async () => tpOutcome(wikiOkNone, redditOk(4))),
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

  // —— 第三方语料（SP-A §4.4）：两路子阶段各自记状态，原文存档，两路都失败不写证据 ——
  describe('third_party 采集段', () => {
    const dssOf = (deps: ReturnType<typeof makeDeps>, key: string) =>
      deps.writeDataSourceStatus.mock.calls.map((c) => (c as unknown[])[0] as { sourceKey: string; status: string; failureReason?: string }).find((r) => r.sourceKey === key)

    it('两路都成功：写 v2 证据、两份原文挂到证据上，子阶段与父级都 collected；别名取自项目设置', async () => {
      const check = vi.fn(async () => tpOutcome(wikiOkNone, redditOk(4)))
      const deps = makeDeps({ checkThirdPartyPresence: check, getProjectSettings: vi.fn(async () => ({ brandAliases: ['Example App'] })) })
      const { args } = makeArgs()
      await collectEvidenceHandler(args, asCollectDeps(deps))
      expect(check).toHaveBeenCalledWith(expect.objectContaining({ aliases: ['Example App'] }))
      const tp = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'third_party_presence')![0]
      expect((tp.payload as { version: number }).version).toBe(2)
      const rawIds = deps.createEvidenceRaw.mock.calls.map((c) => c[0] as { id: string; sourceKey: string }).filter((r) => r.sourceKey.startsWith('third_party:'))
      expect(rawIds.map((r) => r.sourceKey).sort()).toEqual(['third_party:reddit', 'third_party:wikipedia'])
      expect(deps.linkEvidenceRaw).toHaveBeenCalledWith(rawIds.map((r) => r.id), tp.id)
      expect(dssOf(deps, 'third_party:wikipedia')?.status).toBe('collected')
      expect(dssOf(deps, 'third_party:reddit')?.status).toBe('collected')
      expect(dssOf(deps, 'third_party')?.status).toBe('collected')
    })

    it('Reddit 403：照样写证据（维基可用），reddit 子阶段 failed http_403，父级 partial', async () => {
      const deps = makeDeps({ checkThirdPartyPresence: vi.fn(async () => tpOutcome(wikiOkNone, redditFailed)) })
      const { args } = makeArgs()
      await collectEvidenceHandler(args, asCollectDeps(deps))
      expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'third_party_presence')).toBe(true)
      expect(dssOf(deps, 'third_party:reddit')).toMatchObject({ status: 'failed', failureReason: 'http_403' })
      expect(dssOf(deps, 'third_party')?.status).toBe('partial')
    })

    it('两路都失败：不写证据，父级 failed（原文仍存档）', async () => {
      const deps = makeDeps({ checkThirdPartyPresence: vi.fn(async () => tpOutcome({ status: 'failed', httpStatus: 503, reason: 'http_503' }, redditFailed)) })
      const { args } = makeArgs()
      await collectEvidenceHandler(args, asCollectDeps(deps))
      expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'third_party_presence')).toBe(false)
      expect(dssOf(deps, 'third_party:wikipedia')).toMatchObject({ status: 'failed', failureReason: 'http_503' })
      expect(dssOf(deps, 'third_party')?.status).toBe('failed')
      expect(deps.createEvidenceRaw.mock.calls.filter((c) => (c[0] as { sourceKey: string }).sourceKey.startsWith('third_party:'))).toHaveLength(2)
      expect(deps.linkEvidenceRaw.mock.calls.length).toBe(0)
    })
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

    const spPlatform = (platform: 'youtube' | 'g2' | 'trustpilot' | 'capterra', ok: boolean) => ok
      ? { platform, query: `site:${platform}.com "example"`, status: 'ok' as const, resultCount: 1, topResults: [{ title: 't', url: `https://${platform}.com/x` }] }
      : { platform, query: `site:${platform}.com "example"`, status: 'failed' as const, reason: 'http_429', resultCount: 0, topResults: [] }
    const spOutcome = (oks: [boolean, boolean, boolean, boolean]) => ({
      payload: { brand: 'example', checkedAt: '2026-10-04T00:00:00.000Z', platforms: (['youtube', 'g2', 'trustpilot', 'capterra'] as const).map((p, i) => spPlatform(p, oks[i])) },
      raws: (['youtube', 'g2', 'trustpilot', 'capterra'] as const).map((platform, i) => ({ platform, raw: { status: oks[i] ? 200 : 429, contentType: 'application/json', body: '{}' } })),
    })
    const spDss = (deps: ReturnType<typeof makeDeps>, key: string) =>
      deps.writeDataSourceStatus.mock.calls.map((c) => (c as unknown[])[0] as { sourceKey: string; status: string; failureReason?: string }).find((r) => r.sourceKey === key)

    it('原文在发请求的那个 step 里存档（Inngest 回放时 step 不重跑：挪到 step 外会重复存档或丢原文；第二波审查 T3）', async () => {
      const rawStep: Record<string, string | null> = {}
      let active: string | null = null
      const deps = socialDeps({
        isPsiConfigured: vi.fn(() => true),
        checkThirdPartyPresence: vi.fn(async () => tpOutcome(wikiOkNone, redditOk(4))),
        checkSocialPresence: vi.fn(async () => spOutcome([true, true, true, true])),
        createEvidenceRaw: vi.fn(async (row: { sourceKey: string }) => { rawStep[row.sourceKey] = active }),
      })
      const { args } = makeArgs()
      const run = args.step.run
      args.step.run = (<T,>(id: string, fn: () => Promise<T> | T) =>
        run(id, async () => {
          active = id
          try {
            return await fn()
          } finally {
            active = null
          }
        })) as typeof args.step.run
      await collectEvidenceHandler(args, asCollectDeps(deps))
      expect(rawStep).toEqual({
        psi: 'fetch-psi',
        'third_party:wikipedia': 'third-party-presence',
        'third_party:reddit': 'third-party-presence',
        'social_presence:youtube': 'social-presence',
        'social_presence:g2': 'social-presence',
        'social_presence:trustpilot': 'social-presence',
        'social_presence:capterra': 'social-presence',
      })
    })

    it('部分平台失败：照样写证据；4 个子阶段各记成败，父级 partial；原文都存档并挂到证据上', async () => {
      const deps = socialDeps({ checkSocialPresence: vi.fn(async () => spOutcome([true, false, true, true])) })
      const { args } = makeArgs()
      await collectEvidenceHandler(args, asCollectDeps(deps))
      const sp = deps.createEvidenceArtifact.mock.calls.find((c) => c[0].type === 'social_presence')
      expect(sp).toBeTruthy()
      expect(spDss(deps, 'social_presence:youtube')?.status).toBe('collected')
      expect(spDss(deps, 'social_presence:g2')).toMatchObject({ status: 'failed', failureReason: 'http_429' })
      expect(spDss(deps, 'social_presence:trustpilot')?.status).toBe('collected')
      expect(spDss(deps, 'social_presence:capterra')?.status).toBe('collected')
      expect(spDss(deps, 'social_presence')?.status).toBe('partial')
      const rawRows = deps.createEvidenceRaw.mock.calls.map((c) => c[0] as { id: string; sourceKey: string }).filter((r) => r.sourceKey.startsWith('social_presence:'))
      expect(rawRows).toHaveLength(4)
      expect(deps.linkEvidenceRaw).toHaveBeenCalledWith(rawRows.map((r) => r.id), sp![0].id)
    })

    it('四个平台全部失败：不写证据，父级 failed', async () => {
      const deps = socialDeps({ checkSocialPresence: vi.fn(async () => spOutcome([false, false, false, false])) })
      const { args } = makeArgs()
      await collectEvidenceHandler(args, asCollectDeps(deps))
      expect(deps.createEvidenceArtifact.mock.calls.some((c) => c[0].type === 'social_presence')).toBe(false)
      expect(spDss(deps, 'social_presence')?.status).toBe('failed')
    })

    it('CSE 已配置：落 social_presence(L2) 证据，source 为品牌名', async () => {
      const checkSocialPresence = vi.fn(async () => spOutcome([true, true, true, true]))
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
        sourceKey: 'social_presence', configured: true, authorized: true, attempted: true, status: 'failed', failureReason: 'unexpected_error',
      }))
      expect(deps.markRunStatus).toHaveBeenCalledWith('run_1', 'collected', expect.anything())
      expect(deps.sendDiagnose).toHaveBeenCalled()
    })
  })

  it('DataForSEO 未配置：跳过，不调用 runDataforseo', async () => {
    const runDataforseo = vi.fn(async () => [])
    const deps = makeDeps({ resolveDataforseo: vi.fn(async () => null), runDataforseo })
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
        // gb 而非 global-en：global-en 本身就是美国 2840，区分不出"读市场表"与"写死美国"（第一波审查 T1）。
        getProject: vi.fn(async () => ({
          id: 'proj_1', domain: 'example.com', industry: 'saas', market: 'gb', language: 'en', competitors: [],
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

    it('回测（带 baselineRunId）：AIO 查询复用基线问句集，不按当前项目重建（同协议回测）', async () => {
      const baseline = [
        { id: 'pr_b1', runId: 'run_base', text: 'best document metadata remover', intent: 'recommendation', source: 'template_v2', market: 'gb', language: 'en', priority: 0, branded: false },
        { id: 'pr_b2', runId: 'run_base', text: 'is example safe', intent: 'brand', source: 'template_v2', market: 'gb', language: 'en', priority: 1, branded: true },
      ]
      const deps = aioDeps({ getRunPrompts: vi.fn(async (runId: string) => (runId === 'run_base' ? baseline : [])) })
      const { args } = makeArgs()
      args.event.data = { ...args.event.data, baselineRunId: 'run_base' } as typeof args.event.data
      await collectEvidenceHandler(args, asCollectDeps(deps))
      const fetchMock = (deps.aioProvider as { fetchAioForKeyword: ReturnType<typeof vi.fn> }).fetchAioForKeyword
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(baseline.map((p) => p.text))
    })

    // 基线 run 实际落库的 serp_aio_results 行（形状同本 handler 的 createSerpAioResult 写入）。
    const baselineAioRow = (keyword: string, locationCode: number) => ({
      id: `saio_${keyword.length}_${locationCode}`, runId: 'run_base', evidenceId: 'ev_base', keyword,
      locationCode, languageCode: 'en', aioPresent: true, targetDomainCited: false, citedUrls: [],
      rawAnswerHash: 'h', parserVersion: 'v1', createdAt: '2026-09-20 10:00:00',
    })

    it('回测：基线有 AIO 结果 → 沿用基线实际查过的关键词与地区，即使项目市场已改（第二波审查 I4）', async () => {
      // 基线按英国（2826）跑过 AIO；之后项目市场改成 global-en（2840）。基线没有跑探针，所以没有问句。
      const rows = [baselineAioRow('best document metadata remover', 2826), baselineAioRow('remove exif online', 2826)]
      const deps = aioDeps({
        getProject: vi.fn(async () => ({ id: 'proj_1', domain: 'example.com', industry: 'saas', market: 'global-en', language: 'en', competitors: [] })),
        getRunSerpAioResults: vi.fn(async (runId: string) => (runId === 'run_base' ? rows : [])),
      })
      const { args } = makeArgs()
      args.event.data = { ...args.event.data, baselineRunId: 'run_base' } as typeof args.event.data
      await collectEvidenceHandler(args, asCollectDeps(deps))
      const fetchMock = (deps.aioProvider as { fetchAioForKeyword: ReturnType<typeof vi.fn> }).fetchAioForKeyword
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['best document metadata remover', 'remove exif online'])
      expect(fetchMock.mock.calls.map((c) => c[1])).toEqual([
        { locationCode: 2826, languageCode: 'en' },
        { locationCode: 2826, languageCode: 'en' },
      ])
    })

    it('回测：基线 AIO 关键词优先于基线问句（AIO 实际查的是哪些词就复测哪些词）', async () => {
      const rows = [baselineAioRow('remove exif online', 2826)]
      const prompts = [{ id: 'pr_b1', runId: 'run_base', text: 'some other prompt', intent: 'recommendation', source: 'template_v2', market: 'gb', language: 'en', priority: 0, branded: false }]
      const deps = aioDeps({
        getRunPrompts: vi.fn(async (runId: string) => (runId === 'run_base' ? prompts : [])),
        getRunSerpAioResults: vi.fn(async (runId: string) => (runId === 'run_base' ? rows : [])),
      })
      const { args } = makeArgs()
      args.event.data = { ...args.event.data, baselineRunId: 'run_base' } as typeof args.event.data
      await collectEvidenceHandler(args, asCollectDeps(deps))
      const fetchMock = (deps.aioProvider as { fetchAioForKeyword: ReturnType<typeof vi.fn> }).fetchAioForKeyword
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['remove exif online'])
    })

    function aioStatusCalls(deps: ReturnType<typeof aioDeps>) {
      return (deps.writeDataSourceStatus as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[0] as { sourceKey: string })
        .filter((c) => c.sourceKey === 'aio')
    }

    it('项目语言为空时 AIO 查询走英文模板（SP-A：只做英文市场，回退值由 zh 改 en）', async () => {
      const deps = aioDeps({
        getProject: vi.fn(async () => ({ id: 'proj_1', domain: 'example.com', industry: 'saas tool', market: 'global-en', language: '', competitors: [] })),
      })
      await collectEvidenceHandler(makeArgs().args, asCollectDeps(deps))
      const first = (deps.aioProvider.fetchAioForKeyword as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(first).toMatch(/^[\x20-\x7E]+$/)
    })

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
      // location/language 取自市场表：gb → 2826/en
      expect(fetchMock.mock.calls[0][1]).toEqual({ locationCode: 2826, languageCode: 'en' })

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
      expect(firstResultRow.locationCode).toBe(2826)
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

// 报告页「数据源合同」逐条渲染 t(`report.contract.sourceLabel.${sourceKey}`)。
// 采集端新增数据源却漏配文案时，页面会直接显示原始 key 并在服务端报 MISSING_MESSAGE。
describe('采集写入的每个 sourceKey 都有报告文案', () => {
  it('zh / en 的 report.contract.sourceLabel 覆盖 collect-evidence 写出的全部 sourceKey', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(join(__dirname, 'collect-evidence.ts'), 'utf8')
    const keys = [...new Set([...source.matchAll(/sourceKey: '([a-z_]+)'/g)].map((m) => m[1]))]
    expect(keys.length).toBeGreaterThan(5) // 阳性对照：正则确实抓到了写入点
    for (const locale of ['zh', 'en']) {
      const messages = JSON.parse(readFileSync(join(__dirname, '../../messages', `${locale}.json`), 'utf8'))
      const labels = messages.report.contract.sourceLabel as Record<string, string>
      expect(keys.filter((k) => !labels[k]), `${locale} 缺 sourceLabel`).toEqual([])
    }
  })
})
