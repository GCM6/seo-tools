import { render, screen, within } from '@testing-library/react'
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
function resolveMessage(namespace: string | undefined, key: string, vars?: Record<string, unknown>): string {
  const path = [...(namespace ? namespace.split('.') : []), ...key.split('.')]
  let node: unknown = zhMessages
  for (const p of path) {
    if (typeof node !== 'object' || node === null) throw new Error(`missing message: ${namespace}.${key}`)
    node = (node as Record<string, unknown>)[p]
  }
  if (typeof node !== 'string') throw new Error(`missing message: ${namespace}.${key}`)
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`))
}

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace?: string) => {
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
  knowledgeSession: Record<string, unknown> | undefined
  knowledgeArtifacts: Array<{ artifactType: string; payload: Record<string, unknown> }>
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
    knowledgeSession: undefined,
    knowledgeArtifacts: [],
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

vi.mock('@/lib/knowledge/read', () => ({
  getAnalysisSessionSnapshot: async () => state.fx.knowledgeSession,
  getAnalysisSessionArtifacts: async () => state.fx.knowledgeArtifacts,
  getKnowledgeSourceUrls: async () => [],
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
    // GEO 章节里只有 AIO 区块带「实测」徽章（四家 AI 探针是代理指标，不得标实测）
    expect(within(screen.getByTestId('report-aio')).getByText('实测')).toBeInTheDocument()
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
    // 文档抬头也显示 example.com，查询限定在 AIO 区块内
    const aio = screen.getByTestId('report-aio')
    const ownedRow = within(aio).getByText('example.com').closest('li')
    const thirdPartyRow = within(aio).getByText('wikipedia.org').closest('li')
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
    const cited = screen.getByTestId('report-cited-domains')
    const ownedRow = within(cited).getByText('example.com').closest('li')
    const thirdPartyRow = within(cited).getByText('wikipedia.org').closest('li')
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

describe('ReportView §6 关键词现状 —— 意图承接地图', () => {
  beforeEach(() => {
    state.fx = baseFixtures()
  })

  it('workflow artifact 存在时渲染搜索意图到承接页面的结构化表格', async () => {
    state.fx.run = { ...state.fx.run, analysisSessionId: 'session_1' }
    state.fx.knowledgeArtifacts = [
      {
        artifactType: 'intent_page_fit_map',
        payload: {
          kind: 'intent_page_fit_map',
          version: 1,
          rowCount: 2,
          issueRowCount: 2,
          issueCounts: {
            missing_landing_page: 1,
            intent_page_mismatch: 1,
            overbroad_landing_page: 0,
            underlinked_landing_page: 0,
            thin_landing_page: 0,
            competing_pages: 0,
          },
          rows: [
            {
              query: 'enterprise crm pricing',
              intent: 'transactional',
              expectedPageRoles: ['pricing', 'product', 'service'],
              currentUrl: null,
              currentPageRole: null,
              fitScore: 0,
              impressions: null,
              searchVolume: 700,
              issueCodes: ['missing_landing_page'],
              action: 'create_or_assign_landing_page',
              evidenceIds: ['serp1', 'labs1'],
              source: 'dataforseo',
            },
            {
              query: 'crm pricing',
              intent: 'transactional',
              expectedPageRoles: ['pricing', 'product', 'service'],
              currentUrl: 'https://example.com/blog/pricing-guide',
              currentPageRole: 'blog',
              fitScore: 38,
              impressions: 240,
              searchVolume: null,
              issueCodes: ['intent_page_mismatch'],
              action: 'reshape_landing_page',
              evidenceIds: ['gsc1'],
              source: 'gsc',
            },
          ],
          overbroadPages: [],
        },
      },
    ]

    await renderReport()

    const block = screen.getByTestId('intent-page-fit-map')
    expect(within(block).getByText('搜索意图 → 承接页面')).toBeInTheDocument()
    expect(within(block).getByText('enterprise crm pricing')).toBeInTheDocument()
    expect(within(block).getByText('无明确承接页')).toBeInTheDocument()
    expect(within(block).getByText('缺承接页')).toBeInTheDocument()
    expect(within(block).getByText('创建或指定合适承接页')).toBeInTheDocument()
    expect(within(block).getByText('https://example.com/blog/pricing-guide')).toBeInTheDocument()
    expect(within(block).getByText('博客/文章')).toBeInTheDocument()
    expect(within(block).getByText('意图不匹配')).toBeInTheDocument()
  })
})

// P1-1「报告结论不先行」修复：把 9 段重排为「结论先行三段式」——第一屏读懂现状 + 下一步，
// 优先级矩阵/行动路线图上移到五支柱明细之前，方法与范围下沉到回测之前。
// 只验证重排顺序、新增的「接下来做的 3 件事」渲染/空态、以及 constraint.* 文案改写；
// 不复测已有各段内部渲染逻辑（前面各 describe 块已覆盖）。
describe('ReportView 文档结构（结论先行）', () => {
  beforeEach(() => {
    state.fx = baseFixtures()
  })

  function recommendationRow(overrides: Partial<{
    id: string
    findingId: string
    what: string
    priority: string
    status: string
  }>) {
    return {
      id: overrides.id ?? 'rec_1',
      findingId: overrides.findingId ?? 'f1',
      what: overrides.what ?? '示例建议',
      why: '示例理由',
      expectedImpact: '',
      effort: '低',
      priority: overrides.priority ?? 'quick_win',
      confidence: '',
      status: overrides.status ?? 'proposed',
      outcome: '',
      validationMethod: '',
    }
  }

  it('文档结构（ux-blueprint §5）：编号区段 ①–⑤ 在前，8 个详细章节按顺序默认折叠在后', async () => {
    state.fx.recommendations = [recommendationRow({ id: 'r1', what: '修复移动端渲染空白问题', priority: 'quick_win' })]
    await renderReport()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      '1结论',
      '2先做这 3 件事',
      '3关键数据',
      '4证据等级怎么读',
      '5下一次复查',
      '详细章节',
    ])
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '优先级矩阵',
      '行动路线图',
      '五支柱明细',
      'GEO 可见度补充',
      '关键词现状与缺口',
      '竞品对比',
      '方法与范围',
      '回测计划与闭环结果',
    ])
    for (const id of ['sec-priority', 'sec-roadmap', 'sec-pillars', 'sec-geo', 'sec-keywords', 'sec-competitors', 'sec-method', 'sec-retest']) {
      const chapter = document.getElementById(id)
      expect(chapter?.tagName).toBe('DETAILS')
      expect(chapter).not.toHaveAttribute('open')
    }
  })

  it('抬头：分享页标题是 h1，报告编号 R-<run id 前 8 位>，页脚同号', async () => {
    await renderReport()
    expect(screen.getByRole('heading', { level: 1, name: 'example.com' })).toBeInTheDocument()
    expect(screen.getByText('R-run_1')).toBeInTheDocument()
    expect(screen.getByText('报告编号 R-run_1')).toBeInTheDocument()
  })

  it('约束定位卡使用改写后的人话文案（保留原 constraint.* key，不再是术语堆砌）', async () => {
    state.fx.findings = [
      {
        id: 'f1',
        side: 'us',
        pillar: 'P1',
        title: '首页抓取被阻断',
        description: 'robots.txt 拦截了核心页面',
        severity: 'high',
        claimType: 'measured_hard',
        confidence: 'high',
        evidenceRefs: ['page_fetch_1'],
        status: 'open',
      },
    ]
    await renderReport()
    const expectedText = resolveMessage('report', 'constraint.systemic_basics')
    expect(screen.getByText(expectedText)).toBeInTheDocument()
    // 旧的术语堆砌文案不应再出现
    expect(
      screen.queryByText('系统性基础问题：存在抓取 / 索引 / 渲染层面的高危阻断，请优先修复技术地基（P1）。'),
    ).not.toBeInTheDocument()
  })

  it('「接下来做的 3 件事」取优先级矩阵 top3（quick_win 优先），每项带跳转到优先级矩阵详情的锚点', async () => {
    state.fx.recommendations = [
      recommendationRow({ id: 'r1', what: '修复移动端渲染空白问题', priority: 'quick_win' }),
      recommendationRow({ id: 'r2', what: '补齐产品页结构化数据', priority: 'quick_win' }),
      recommendationRow({ id: 'r3', what: '扩充无品牌关键词内容', priority: 'strategic' }),
      recommendationRow({ id: 'r4', what: '优化次要页面标题', priority: 'fill_in' }),
    ]
    await renderReport()
    const block = screen.getByTestId('next-steps')
    const items = within(block).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('修复移动端渲染空白问题')
    expect(items[1]).toHaveTextContent('补齐产品页结构化数据')
    expect(items[2]).toHaveTextContent('扩充无品牌关键词内容')
    expect(within(block).queryByText('优化次要页面标题')).not.toBeInTheDocument()
    const links = within(block).getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveAttribute('href', '#sec-priority')
  })

  it('优先级矩阵为空（无建议）时，「接下来做的 3 件事」整块不渲染，不硬凑空态', async () => {
    state.fx.recommendations = []
    await renderReport()
    expect(screen.queryByTestId('next-steps')).not.toBeInTheDocument()
    expect(screen.queryByText(resolveMessage('report', 'summary.nextStepsTitle'))).not.toBeInTheDocument()
    // 后面的区段编号顺延，不留空号
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).slice(0, 4)).toEqual([
      '1结论',
      '2关键数据',
      '3证据等级怎么读',
      '4下一次复查',
    ])
  })
})

describe('ReportView 数据源合同：子阶段分组（SP-A §4.2）', () => {
  beforeEach(() => {
    state.fx = baseFixtures()
  })

  const dss = (sourceKey: string, status: string, extra: Record<string, unknown> = {}) => ({
    sourceKey, configured: true, authorized: true, attempted: status !== 'not_attempted', status, failureReason: null, capturedEvidenceCount: 0, protocolSnapshot: null, ...extra,
  })

  it('父项下逐条列出子阶段的中文名、状态与失败原因；未覆盖项里的子阶段也用中文名，不显示原始键名', async () => {
    state.fx.dataSourceStatuses = [
      dss('dataforseo', 'partial', { capturedEvidenceCount: 1 }),
      dss('dataforseo:labs', 'failed', { failureReason: 'task_40101' }),
      dss('dataforseo:backlinks', 'collected', { capturedEvidenceCount: 1 }),
      dss('third_party', 'partial', { capturedEvidenceCount: 1 }),
      dss('third_party:reddit', 'failed', { failureReason: 'http_403' }),
    ]
    await renderReport()
    const zh = zhMessages.report.contract
    const sources = screen.getByRole('heading', { name: zh.dataSourcesTitle }).nextElementSibling as HTMLElement
    const labsRow = within(sources).getByText(new RegExp(zh.subSourceLabel.dataforseo_labs)).closest('li') as HTMLElement
    expect(labsRow.textContent).toContain(zh.sourceStatus.failed)
    expect(labsRow.textContent).toContain('task_40101')
    expect(within(sources).getByText(new RegExp(zh.subSourceLabel.third_party_reddit)).closest('li')?.textContent).toContain('http_403')
    const gapList = screen.getByRole('heading', { name: zh.gapsTitle }).parentElement as HTMLElement
    expect(gapList.textContent).toContain(`${zh.sourceLabel.dataforseo} · ${zh.subSourceLabel.dataforseo_labs}`)
    const page = document.body.textContent ?? ''
    expect(page).not.toContain('dataforseo:labs')
    expect(page).not.toContain('subSourceLabel')
  })
})
