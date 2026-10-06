import { describe, it, expect, vi } from 'vitest'
import { collectEvidenceHandler } from './collect-evidence'
import { makeDeps, makeArgs, asCollectDeps } from '@/lib/test-fixtures/collect-evidence-deps'
import { fetchPageSpeedInsights, type PsiStrategy } from '@/lib/collection/psi'
import { checkThirdPartyPresence, type ThirdPartyInput } from '@/lib/collection/third-party-presence'
import { checkSocialPresence } from '@/lib/collection/social-presence'
import { createGoogleCseSearchVisibilityProvider } from '@/lib/search/search-visibility-provider'
import { createDataforseoProvider } from '@/lib/dataforseo/provider'
import { collectDataforseoStage, type DataforseoStageArgs, type DataforseoStageDeps } from '@/lib/dataforseo/collect-stage'
import { refreshAccessToken } from '@/lib/gsc/oauth'
import { buildRuleContext } from '@/lib/diagnosis/context'
import { evaluateRules } from '@/lib/diagnosis/engine'
import { allRules } from '@/lib/diagnosis/rules'
import type { DiagnosisEvidenceRow } from '@/lib/diagnosis/types'
import type { RawResponse } from '@/lib/collection/result'
import type { NewEvidenceArtifact } from '@/lib/repositories'
import {
  CSE_403_NO_KEY_BODY,
  DFS_TASK_40101_BODY,
  MEDIAWIKI_MAXLAG_ERROR_BODY,
  METADOCU_PROJECT_DOMAIN,
  METADOCU_PROJECT_MARKET,
  PSI_429_QUOTA_BODY,
  REDDIT_403,
} from '@/lib/test-fixtures/real-shapes'

// 失败矩阵（SP-A §4.1 铁律：采集失败不能变成测得的 0 / 空 / collected）。
// 各采集器用真实实现，只伪造网络响应；跑完整个 handler，再用真实 buildRuleContext + evaluateRules(allRules) 求值，断言：
//   1. 失败来源的子阶段记 failed 且原因非空；
//   2. 失败来源不写证据（于是不可能有命中引用它）；
//   3. 依赖这些来源的规则（G07 / SP01 / SP02 / T09a-c / K01 / K02 / K06）都不命中。
// 正向对照：同一装置在数据正常时这些规则确实会命中——证明"不命中"来自失败处理，而不是装置本身让规则无从触发。

type Reply = { status: number; body: string; contentType?: string } | 'throw'
const respond = (r: Reply): Response => {
  if (r === 'throw') throw new TypeError('fetch failed')
  return new Response(r.body, { status: r.status, headers: { 'content-type': r.contentType ?? 'application/json; charset=utf-8' } })
}
const json = (status: number, body: unknown): Reply => ({ status, body: typeof body === 'string' ? body : JSON.stringify(body) })

interface Scenario {
  psi: Reply
  wikipedia: Reply
  reddit: Reply
  cse: Reply
  dataforseo: Reply
  gscToken: Reply
}

// 按维度返回的 GSC 行（只在 token 换取成功时才会被调用）。
const GSC_ROWS = {
  query: [
    { keys: ['remove exif online'], clicks: 5, impressions: 800, ctr: 0.006, position: 8 },
    { keys: ['pdf metadata remover'], clicks: 2, impressions: 1000, ctr: 0.002, position: 3 },
  ],
  pageQuery: [
    { keys: ['https://metadocu.com/a', 'remove exif online'], clicks: 1, impressions: 60, ctr: 0.016, position: 8 },
    { keys: ['https://metadocu.com/b', 'remove exif online'], clicks: 1, impressions: 50, ctr: 0.02, position: 12 },
  ],
}

const PROJECT = {
  domain: METADOCU_PROJECT_DOMAIN,
  industry: 'document metadata removal tool',
  market: METADOCU_PROJECT_MARKET,
  language: 'en',
  competitors: [] as string[],
}

async function runScenario(s: Scenario) {
  const createEvidenceArtifact = vi.fn(async (row: NewEvidenceArtifact) => [row])
  const linkEvidenceRaw = vi.fn(async (ids: string[], evidenceId: string) => { void ids; void evidenceId })
  const dfsBuffer: RawResponse[] = []
  const deps = makeDeps({
    createEvidenceArtifact,
    linkEvidenceRaw,
    getProject: vi.fn(async () => ({ id: 'proj_1', ...PROJECT })),
    getProjectSettings: vi.fn(async () => ({
      crawlEnabled: false,
      gscConnected: true,
      gscRefreshToken: 'legacy-plain-refresh-token',
      gscSiteUrl: 'sc-domain:metadocu.com',
      defaultModels: [],
      brandAliases: [],
    })),
    isPsiConfigured: vi.fn(() => true),
    fetchPageSpeedInsights: (url: string, strategy: PsiStrategy) =>
      fetchPageSpeedInsights(url, strategy, (async () => respond(s.psi)) as unknown as typeof fetch),
    checkThirdPartyPresence: (input: ThirdPartyInput) =>
      checkThirdPartyPresence(input, (async (u: RequestInfo | URL) => respond(String(u).includes('wikipedia.org') ? s.wikipedia : s.reddit)) as typeof fetch),
    searchVisibilityProvider: createGoogleCseSearchVisibilityProvider({ apiKey: 'k', cx: 'c', fetchImpl: (async () => respond(s.cse)) as typeof fetch }),
    checkSocialPresence,
    isGscPlatformConfigured: vi.fn(() => true),
    refreshGscAccessToken: (token: string) =>
      refreshAccessToken(token, { GOOGLE_OAUTH_CLIENT_ID: 'id', GOOGLE_OAUTH_CLIENT_SECRET: 'secret' }, (async () => respond(s.gscToken)) as typeof fetch),
    querySearchAnalytics: vi.fn(async (_token: string, _site: string, opts: { dimensions: string[] }) =>
      opts.dimensions.length === 1 ? GSC_ROWS.query : GSC_ROWS.pageQuery),
    getTargetKeywords: vi.fn(async () => ['remove pdf metadata']),
    resolveDataforseo: vi.fn(async () => ({
      provider: createDataforseoProvider({
        login: 'u',
        password: 'p',
        fetchImpl: (async () => respond(s.dataforseo)) as typeof fetch,
        onResponse: ({ raw }) => { dfsBuffer.push(raw) },
      }),
      drainRaws: () => dfsBuffer.splice(0),
    })),
    runDataforseo: (args: DataforseoStageArgs) =>
      collectDataforseoStage(args, { createEvidenceArtifact, upsertCompetitor: vi.fn(async (row: unknown) => [row]), linkEvidenceRaw } as unknown as DataforseoStageDeps),
  })
  const { args } = makeArgs()
  args.event.data = { ...args.event.data, url: 'https://metadocu.com/' } as typeof args.event.data
  await collectEvidenceHandler(args, asCollectDeps(deps))

  const evidence: DiagnosisEvidenceRow[] = createEvidenceArtifact.mock.calls.map(([e]) => ({
    id: e.id,
    type: e.type,
    claimLevel: e.claimLevel,
    source: e.source ?? '',
    payload: e.payload,
    rawText: e.rawText ?? '',
    sitePageId: e.sitePageId ?? null,
  })) as DiagnosisEvidenceRow[]
  const dss = new Map<string, { status: string; failureReason?: string | null }>()
  for (const c of deps.writeDataSourceStatus.mock.calls as unknown as [{ sourceKey: string; status: string; failureReason?: string | null }][]) dss.set(c[0].sourceKey, c[0])
  const hits = evaluateRules(buildRuleContext({ project: PROJECT, evidence, probe: null }), allRules)
  return { evidence, dss, hits }
}

const GUARDED_RULES = ['G07', 'SP01', 'SP02', 'T09a', 'T09b', 'T09c', 'K01', 'K02', 'K06']
// 失败来源会写的证据类型：一条都不该出现。
const FAILED_SOURCE_TYPES = ['psi', 'third_party_presence', 'social_presence', 'serp_snapshot', 'gsc', 'dataforseo_serp', 'dataforseo_labs', 'dataforseo_backlinks']
const SOCIAL_KEYS = ['youtube', 'g2', 'trustpilot', 'capterra'].map((p) => `social_presence:${p}`)
const DFS_KEYS = ['seed_serp', 'labs', 'backlinks', 'bing_index', 'brand_serp'].map((s) => `dataforseo:${s}`)

// 一个"HTTP 层失败"的基线场景：各来源的真实失败形态（PSI 配额 429、维基 500、Reddit 403 拦截页、CSE 403、DataForSEO 402、GSC invalid_grant）。
const HTTP_FAILURES: Scenario = {
  psi: json(429, PSI_429_QUOTA_BODY),
  wikipedia: { status: 500, body: '<html><body>Internal Server Error</body></html>', contentType: 'text/html' },
  reddit: { status: REDDIT_403.status, body: REDDIT_403.bodyPrefix, contentType: REDDIT_403.contentType },
  cse: json(403, CSE_403_NO_KEY_BODY),
  // DataForSEO 余额不足：按官方错误码表 40200 "Payment Required." 构造（HTTP 402 未在真实账户上触发过）。
  dataforseo: json(402, { version: '0.1.20260917', status_code: 40200, status_message: 'Payment Required.', time: '0 sec.', cost: 0, tasks_count: 0, tasks_error: 0, tasks: null }),
  gscToken: json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
}

function expectIronLaw(out: Awaited<ReturnType<typeof runScenario>>, failedKeys: string[]) {
  for (const key of failedKeys) {
    const row = out.dss.get(key)
    expect(row?.status, key).toBe('failed')
    expect(row?.failureReason, key).toBeTruthy()
  }
  expect(out.evidence.map((e) => e.type).filter((t) => FAILED_SOURCE_TYPES.includes(t))).toEqual([])
  const ids = new Set(out.evidence.map((e) => e.id))
  for (const h of out.hits) for (const ref of h.evidenceRefs) expect(ids.has(ref), `${h.ruleId} → ${ref}`).toBe(true)
  expect(out.hits.map((h) => h.ruleId).filter((id) => GUARDED_RULES.includes(id))).toEqual([])
}

describe('采集失败矩阵（SP-A §4.1：失败不变成测量值，规则不在失败数据上命中）', () => {
  it('受检规则都真实存在（防止"不命中"因规则 ID 写错而空过）', () => {
    const ids = allRules.map((r) => r.id)
    for (const id of GUARDED_RULES) expect(ids, id).toContain(id)
  })

  it('正向对照：同一装置在数据正常时，G07 / SP01 / SP02 / T09a / K01 / K02 / K06 都会命中', async () => {
    const out = await runScenario({
      psi: json(200, {
        loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3200, category: 'AVERAGE' }, INTERACTION_TO_NEXT_PAINT: { percentile: 150, category: 'GOOD' }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12, category: 'NEEDS_IMPROVEMENT' } } },
        lighthouseResult: { categories: { performance: { score: 0.74 } }, audits: { 'render-blocking-resources': { title: 'Eliminate render-blocking resources', details: { type: 'opportunity', overallSavingsMs: 900 } }, 'server-response-time': { title: 'Reduce initial server response time', numericValue: 1200, details: { type: 'table' } } } },
      }),
      // 真实 MediaWiki 形态里 Metadocu 的缺失页对象（见 MEDIAWIKI_TITLES_RESPONSE）。
      wikipedia: json(200, { batchcomplete: true, query: { pages: [{ ns: 0, title: 'Metadocu', missing: true }] } }),
      reddit: json(200, { data: { children: [] } }),
      cse: json(200, { kind: 'customsearch#search', searchInformation: { totalResults: '0' } }),
      dataforseo: HTTP_FAILURES.dataforseo,
      gscToken: json(200, { access_token: 'ya29.test', expires_in: 3599, token_type: 'Bearer' }),
    })
    const fired = new Set(out.hits.map((h) => h.ruleId))
    for (const id of ['G07', 'SP01', 'SP02', 'T09a', 'K01', 'K02', 'K06']) expect(fired.has(id), id).toBe(true)
  })

  it('HTTP 层失败：PSI 429、维基 500、Reddit 403、CSE 403、DataForSEO 402、GSC invalid_grant', async () => {
    const out = await runScenario(HTTP_FAILURES)
    expectIronLaw(out, ['psi', 'third_party:wikipedia', 'third_party:reddit', 'third_party', ...SOCIAL_KEYS, 'social_presence', 'google_cse', ...DFS_KEYS, 'dataforseo', 'gsc'])
    expect(out.dss.get('psi')?.failureReason).toBe('http_429')
    for (const k of DFS_KEYS) expect(out.dss.get(k)?.failureReason, k).toBe('http_402')
    expect(out.dss.get('gsc')?.failureReason).toContain('invalid_grant')
  })

  it('200 但不可用 / 任务级失败：PSI 无数据、维基 maxlag 信封、DataForSEO 任务 40101', async () => {
    const out = await runScenario({
      ...HTTP_FAILURES,
      // Lighthouse 跑失败时性能分为 null、也没有 CrUX 现场数据（按 PSI v5 字段构造）。
      psi: json(200, { lighthouseResult: { categories: { performance: { score: null } }, audits: {} } }),
      wikipedia: json(200, MEDIAWIKI_MAXLAG_ERROR_BODY),
      dataforseo: json(200, DFS_TASK_40101_BODY),
    })
    expectIronLaw(out, ['psi', 'third_party:wikipedia', 'third_party:reddit', ...SOCIAL_KEYS, ...DFS_KEYS, 'gsc'])
    expect(out.dss.get('psi')?.failureReason).toBe('empty_result')
    expect(out.dss.get('third_party:wikipedia')?.failureReason).toBe('api_maxlag')
    for (const k of DFS_KEYS) expect(out.dss.get(k)?.failureReason, k).toBe('task_40101')
  })

  it('200、JSON 合法但缺关键字段（最终审查 F1-1）：PSI {}、维基 {}、Reddit {}、CSE {}、DataForSEO result [{}]', async () => {
    const out = await runScenario({
      ...HTTP_FAILURES,
      psi: json(200, {}),
      wikipedia: json(200, {}),
      reddit: json(200, {}),
      cse: json(200, {}),
      dataforseo: json(200, { version: '0.1.20260917', status_code: 20000, status_message: 'Ok.', tasks: [{ status_code: 20000, status_message: 'Ok.', result: [{}] }] }),
    })
    expectIronLaw(out, ['psi', 'third_party:wikipedia', 'third_party:reddit', ...SOCIAL_KEYS, 'google_cse', ...DFS_KEYS, 'gsc'])
    expect(out.dss.get('third_party:reddit')?.failureReason).toBe('invalid_shape')
    for (const k of SOCIAL_KEYS) expect(out.dss.get(k)?.failureReason, k).toBe('invalid_shape')
    for (const k of DFS_KEYS) expect(out.dss.get(k)?.failureReason, k).toBe('invalid_shape')
  })

  it('网络错误：所有外部请求都抛 fetch failed', async () => {
    const out = await runScenario({ psi: 'throw', wikipedia: 'throw', reddit: 'throw', cse: 'throw', dataforseo: 'throw', gscToken: 'throw' })
    expectIronLaw(out, ['psi', 'third_party:wikipedia', 'third_party:reddit', ...SOCIAL_KEYS, 'google_cse', ...DFS_KEYS, 'gsc'])
    expect(out.dss.get('psi')?.failureReason).toBe('network_error')
    for (const k of DFS_KEYS) expect(out.dss.get(k)?.failureReason, k).toBe('network_error')
  })
})
