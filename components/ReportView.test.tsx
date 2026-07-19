import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import zhMessages from '@/messages/zh.json'

// ReportView 是 async Server Component（顶层 `await getRun(...)` 等）。本仓库目前没有任何
// Server Component 页面级测试先例（调研已确认：唯一同类是 route handler 测试）。React 19 的
// react-dom 客户端渲染器不支持树里出现"未被上层预先 await 的 async 组件"——实测验证：把
// <KeywordTable/>（本文件内唯一的 async 子组件，属于 §5 关键词区，不在本次任务范围）直接放进
// render() 会抛「Only Server Components can be async at the moment」。因此这里连同 §5 一并
// mock 掉 KeywordTable 为同步桩组件，只验证本任务改动的 §4 GEO 区块（AIO 曝光 + 被引用域名）。
vi.mock('@/components/KeywordTable', () => ({
  KeywordTable: () => <div data-testid="keyword-table-stub" />,
}))

// 简易 t()：按 key 路径查真实 messages/zh.json 并做 {var} 插值，而不是把每个 key 手写死一份
// 期望字符串——这样测试断言读到的就是产品会渲染出的同一份文案，新增/改名 key 忘记同步会直接
// 因「missing message」报错，不会静默通过。
function resolveMessage(namespace: string, key: string, vars?: Record<string, unknown>): string {
  const path = [...namespace.split('.'), ...key.split('.')]
  let node: unknown = zhMessages
  for (const p of path) {
    if (typeof node !== 'object' || node === null) throw new Error(`missing message: ${namespace}.${key}`)
    node = (node as Record<string, unknown>)[p]
  }
  if (typeof node !== 'string') throw new Error(`missing message: ${namespace}.${key}`)
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`))
}

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const t = (key: string, vars?: Record<string, unknown>) => resolveMessage(namespace, key, vars)
    return t
  },
  setRequestLocale: () => {},
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

// ReportToc（§ 目录，'use client'）挂载后订阅 IntersectionObserver；jsdom 不提供该全局，
// 真实浏览器/Next 运行时才有。这里用最小桩满足挂载副作用，不测目录高亮行为本身（不在本任务范围）。
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error jsdom 环境没有该全局，测试期补一个最小桩
globalThis.IntersectionObserver ??= IntersectionObserverStub

interface Fixtures {
  run: Record<string, unknown> | null
  project: Record<string, unknown> | null
  findings: unknown[]
  recommendations: unknown[]
  evidence: { id: string; type: string; request: unknown; payload: unknown }[]
  referenceArtifacts: unknown[]
  keywordMetrics: unknown[]
  keywordGaps: unknown[]
  competitors: unknown[]
  keywords: unknown[]
  retestSnapshots: unknown[]
  dataSourceStatuses: unknown[]
  probeResults: {
    promptId: string
    brandPresent: boolean
    competitorsMentioned: string[]
    evidenceId: string
    provider: string
    sentiment: string
    citedUrls: string[]
    hedged: boolean
    unknownAdmission: boolean
  }[]
  promptRows: { id: string; text: string; priority: number; branded?: boolean }[]
  aioResultRows: { keyword: string; aioPresent: boolean; targetDomainCited: boolean; citedUrls: string[] }[]
  byokStatuses: { key: string; configured: boolean }[]
}

function baseFixtures(): Fixtures {
  return {
    run: {
      id: 'run_1',
      projectId: 'proj_1',
      rulesVersion: null,
      protocolVersion: 'v2',
      startedAt: '2026-07-01T00:00:00.000Z',
      finishedAt: '2026-07-01T01:00:00.000Z',
      status: 'output',
    },
    project: {
      id: 'proj_1',
      domain: 'https://example.com',
      market: '',
      language: '',
      competitors: [],
    },
    findings: [],
    recommendations: [],
    evidence: [],
    referenceArtifacts: [],
    keywordMetrics: [],
    keywordGaps: [],
    competitors: [],
    keywords: [],
    retestSnapshots: [],
    dataSourceStatuses: [],
    probeResults: [],
    promptRows: [],
    aioResultRows: [],
    byokStatuses: [{ key: 'dataforseo', configured: false }],
  }
}

const state: { fx: Fixtures } = { fx: baseFixtures() }

vi.mock('@/lib/repositories', () => ({
  getRun: async (id: string) => (state.fx.run ? { ...state.fx.run, id } : null),
  getProject: async () => state.fx.project,
  getFindings: async () => state.fx.findings,
  getRecommendations: async () => state.fx.recommendations,
  getRunEvidence: async () => state.fx.evidence,
  getReferenceArtifacts: async () => state.fx.referenceArtifacts,
  getRunKeywordMetrics: async () => state.fx.keywordMetrics,
  getRunKeywordGaps: async () => state.fx.keywordGaps,
  getConfirmedCompetitors: async () => state.fx.competitors,
  getKeywords: async () => state.fx.keywords,
  getRetestSnapshots: async () => state.fx.retestSnapshots,
  getRunDataSourceStatuses: async () => state.fx.dataSourceStatuses,
  getRunProbeResults: async () => state.fx.probeResults,
  getRunPrompts: async () => state.fx.promptRows,
  getRunSerpAioResults: async () => state.fx.aioResultRows,
}))

vi.mock('@/lib/settings/load-statuses', () => ({
  loadDataSourceStatuses: async () => state.fx.byokStatuses,
}))

const { ReportView } = await import('./ReportView')

async function renderReport() {
  const element = await ReportView({ runId: 'run_1' })
  render(element)
}

describe('ReportView §4 GEO 补充 —— AIO 实测曝光 + 被引用域名', () => {
  beforeEach(() => {
    state.fx = baseFixtures()
  })

  it('空态①：未配置 DataForSEO 时不渲染任何 AIO 数字，文案说明原因', async () => {
    state.fx.byokStatuses = [{ key: 'dataforseo', configured: false }]
    await renderReport()
    expect(screen.getByText('未配置 DataForSEO 数据源，无法采集真实 SERP，本区块留空')).toBeInTheDocument()
    expect(screen.queryByText('出现 AI Overview')).not.toBeInTheDocument()
  })

  it('空态②：已配置但本轮未采集 AIO（无 serp_aio 证据）', async () => {
    state.fx.byokStatuses = [{ key: 'dataforseo', configured: true }]
    state.fx.evidence = []
    state.fx.aioResultRows = []
    await renderReport()
    expect(screen.getByText('DataForSEO 已配置，但本轮尚未采集 AI Overviews 曝光数据')).toBeInTheDocument()
    expect(screen.queryByText('未配置 DataForSEO 数据源，无法采集真实 SERP，本区块留空')).not.toBeInTheDocument()
    expect(screen.queryByText('出现 AI Overview')).not.toBeInTheDocument()
  })

  it('空态③：已采集，如实展示（含 0 命中），不当故障', async () => {
    state.fx.byokStatuses = [{ key: 'dataforseo', configured: true }]
    state.fx.evidence = [
      { id: 'ev_aio_1', type: 'serp_aio', request: null, payload: null },
      { id: 'ev_aio_2', type: 'serp_aio', request: null, payload: null },
    ]
    state.fx.aioResultRows = [
      { keyword: 'q1', aioPresent: false, targetDomainCited: false, citedUrls: [] },
      { keyword: 'q2', aioPresent: false, targetDomainCited: false, citedUrls: [] },
    ]
    await renderReport()
    expect(screen.getByText('出现 AI Overview')).toBeInTheDocument()
    expect(screen.getByText('本轮 AI Overview 未引用任何域名')).toBeInTheDocument()
    expect(screen.queryByText('DataForSEO 已配置，但本轮尚未采集 AI Overviews 曝光数据')).not.toBeInTheDocument()
    // 只有 AIO 这块允许出现「实测」字样
    expect(screen.getByText('实测')).toBeInTheDocument()
  })

  it('AIO 命中时展示 owned 徽标（domain 参数生效）', async () => {
    state.fx.byokStatuses = [{ key: 'dataforseo', configured: true }]
    state.fx.evidence = [{ id: 'ev_aio_1', type: 'serp_aio', request: null, payload: null }]
    state.fx.aioResultRows = [
      {
        keyword: 'q1',
        aioPresent: true,
        targetDomainCited: true,
        citedUrls: ['https://example.com/features', 'https://wikipedia.org/wiki/Foo'],
      },
    ]
    await renderReport()
    expect(screen.getByText('example.com')).toBeInTheDocument()
    expect(screen.getByText('wikipedia.org')).toBeInTheDocument()
    const ownedRow = screen.getByText('example.com').closest('li')
    const thirdPartyRow = screen.getByText('wikipedia.org').closest('li')
    expect(ownedRow).toHaveTextContent('自有域名')
    expect(thirdPartyRow).not.toHaveTextContent('自有域名')
  })

  it('被引用域名 Top 列表：aggregateProbeSummary 传入 domain 后 owned 判定生效', async () => {
    state.fx.promptRows = [{ id: 'p1', text: '这是什么产品', priority: 1, branded: false }]
    state.fx.probeResults = [
      {
        promptId: 'p1',
        brandPresent: true,
        competitorsMentioned: [],
        evidenceId: 'ev_probe_1',
        provider: 'perplexity',
        sentiment: 'neutral',
        citedUrls: ['https://example.com/page', 'https://wikipedia.org/wiki/Foo'],
        hedged: false,
        unknownAdmission: false,
      },
    ]
    state.fx.evidence = [{ id: 'ev_probe_1', type: 'ai_answer', request: { web_search_enabled: true }, payload: { answerText: 'example.com 是……' } }]
    await renderReport()
    expect(screen.getByText('被引用域名 Top 列表')).toBeInTheDocument()
    const ownedRow = screen.getByText('example.com').closest('li')
    const thirdPartyRow = screen.getByText('wikipedia.org').closest('li')
    expect(ownedRow).toHaveTextContent('自有')
    expect(thirdPartyRow).toHaveTextContent('第三方')
  })

  it('无被引用样本时不渲染被引用域名区块', async () => {
    state.fx.promptRows = []
    state.fx.probeResults = []
    await renderReport()
    expect(screen.queryByText('被引用域名 Top 列表')).not.toBeInTheDocument()
  })

  it('四家 AI 探针区块附代理指标口径说明，不与「实测」混用', async () => {
    state.fx.promptRows = [{ id: 'p1', text: '这是什么产品', priority: 1, branded: false }]
    state.fx.probeResults = [
      {
        promptId: 'p1',
        brandPresent: true,
        competitorsMentioned: [],
        evidenceId: 'ev_probe_1',
        provider: 'perplexity',
        sentiment: 'neutral',
        citedUrls: [],
        hedged: false,
        unknownAdmission: false,
      },
    ]
    await renderReport()
    expect(
      screen.getByText('口径说明：以上四家 AI 探针（ChatGPT / Perplexity / Gemini / DeepSeek）数据来自开发者 API 采样，反映模型可判定的代理指标，不是真实曝光实测。'),
    ).toBeInTheDocument()
  })
})

describe('ReportView §9 回测表 —— metricName 人类可读标签', () => {
  beforeEach(() => {
    state.fx = baseFixtures()
  })

  function snapshotRow(metricName: string) {
    return {
      id: `rts_${metricName}`,
      metricName,
      baselineValue: '10%',
      retestValue: '20%',
      delta: '+10',
      interpretation: '示例解读',
    }
  }

  it('既有 metricName（findings.* / health.overall / probe.brand_sov / probe.brand_presence）显示中文标签，不显示裸 key', async () => {
    state.fx.retestSnapshots = [
      snapshotRow('findings.resolved'),
      snapshotRow('findings.persistent'),
      snapshotRow('findings.new'),
      snapshotRow('findings.regressed'),
      snapshotRow('health.overall'),
      snapshotRow('probe.brand_sov'),
      snapshotRow('probe.brand_presence'),
    ]
    await renderReport()
    expect(screen.getByText('已修复问题数')).toBeInTheDocument()
    expect(screen.getByText('仍未解决问题数')).toBeInTheDocument()
    expect(screen.getByText('新出现问题数')).toBeInTheDocument()
    expect(screen.getByText('恶化问题数')).toBeInTheDocument()
    expect(screen.getByText('健康分（综合）')).toBeInTheDocument()
    expect(screen.getByText('品牌 AI 答案占有率（SoV）')).toBeInTheDocument()
    expect(screen.getByText('无品牌提问品牌召回率')).toBeInTheDocument()
    expect(screen.queryByText('findings.resolved')).not.toBeInTheDocument()
    expect(screen.queryByText('probe.brand_sov')).not.toBeInTheDocument()
  })

  it('新增三个 GEO metricName（probe.cited_owned_share / aio.present_rate / aio.owned_cited_rate）显示中文标签', async () => {
    state.fx.retestSnapshots = [
      snapshotRow('probe.cited_owned_share'),
      snapshotRow('aio.present_rate'),
      snapshotRow('aio.owned_cited_rate'),
    ]
    await renderReport()
    expect(screen.getByText('被引用域名中自有站点占比')).toBeInTheDocument()
    expect(screen.getByText('Google AI Overview 曝光率（实测）')).toBeInTheDocument()
    expect(screen.getByText('AI Overview 引用中自有站点占比（实测）')).toBeInTheDocument()
    expect(screen.queryByText('probe.cited_owned_share')).not.toBeInTheDocument()
    expect(screen.queryByText('aio.present_rate')).not.toBeInTheDocument()
    expect(screen.queryByText('aio.owned_cited_rate')).not.toBeInTheDocument()
  })

  it('未登记的 metricName 兜底原样显示原始 key（向前兼容，不崩溃、不显示 namespace 路径）', async () => {
    state.fx.retestSnapshots = [snapshotRow('some.future_metric')]
    await renderReport()
    expect(screen.getByText('some.future_metric')).toBeInTheDocument()
    expect(screen.queryByText(/retest\.metric/)).not.toBeInTheDocument()
  })
})
