import { describe, it, expect } from 'vitest'
import { aggregateProbeSummary, normalizeProjectDomain } from './summary'

const prompts = [
  { id: 'p1', text: '推荐工具？', priority: 0 },
  { id: 'p2', text: '替代品？', priority: 1 },
  { id: 'p3', text: '靠谱吗？', priority: 2 },
]

function result(promptId: string, over: Partial<{ brandPresent: boolean; competitorsMentioned: string[]; evidenceId: string }> = {}) {
  return {
    promptId,
    brandPresent: over.brandPresent ?? false,
    competitorsMentioned: over.competitorsMentioned ?? [],
    evidenceId: over.evidenceId ?? 'ev_x',
  }
}

describe('normalizeProjectDomain', () => {
  it('带协议/www 的完整 URL → 裸 host（去协议、去 www）', () => {
    expect(normalizeProjectDomain('https://www.example.com')).toBe('example.com')
    expect(normalizeProjectDomain('http://example.com/path')).toBe('example.com')
  })
  it('已是裸 host（非法 URL，缺协议）→ 原样返回，不抛错', () => {
    expect(normalizeProjectDomain('example.com')).toBe('example.com')
  })
})

describe('aggregateProbeSummary', () => {
  it('returns null when there are no probe results（无数据不出 0/20 假实测）', () => {
    expect(aggregateProbeSummary({ prompts, results: [], brand: 'metadocu', competitors: [] })).toBeNull()
  })

  it('marks a prompt present when ANY sample of it mentions the brand', () => {
    const s = aggregateProbeSummary({
      prompts,
      results: [
        result('p1', { brandPresent: true, evidenceId: 'ev_hit' }),
        result('p1'),
        result('p2'),
        result('p3'),
      ],
      brand: 'metadocu',
      competitors: [],
    })!
    expect(s.promptsTotal).toBe(3)
    expect(s.promptsPresent).toBe(1)
    expect(s.perPrompt.map((p) => p.present)).toEqual([true, false, false])
    expect(s.perPrompt[0].text).toBe('推荐工具？')
    expect(s.perPrompt[0].answers).toEqual([
      { provider: undefined, answerText: undefined, evidenceId: 'ev_hit', present: true },
      { provider: undefined, answerText: undefined, evidenceId: 'ev_x', present: false },
    ])
    // 代表性证据取第一条命中的（点开能看到品牌确实出现的原文）
    expect(s.sampleEvidenceId).toBe('ev_hit')
  })

  it('computes share of voice per brand/competitor over all samples', () => {
    const s = aggregateProbeSummary({
      prompts,
      results: [
        result('p1', { brandPresent: true, competitorsMentioned: ['Notion'] }),
        result('p2', { competitorsMentioned: ['Notion', 'Confluence'] }),
        result('p3'),
        result('p3', { competitorsMentioned: ['Notion'] }),
      ],
      brand: 'metadocu',
      competitors: ['Notion', 'Confluence'],
    })!
    expect(s.totalSamples).toBe(4)
    // Notion 3/4=75%，metadocu 1/4=25%，Confluence 1/4=25%；降序，you 标记在品牌行
    expect(s.sov).toEqual([
      { name: 'Notion', pct: 75, you: false },
      { name: 'metadocu', pct: 25, you: true },
      { name: 'Confluence', pct: 25, you: false },
    ])
  })

  it('SP-A2 #6：带 answerText 时对当前竞品集重解析（解冻探针期确认竞品）', () => {
    // 'Rival' 不在任何冻结的 competitorsMentioned（模拟探针后才确认的竞品），但原文提到 → 重解析命中
    const s = aggregateProbeSummary({
      prompts,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1', provider: 'openai', answerText: '可以试试 Rival 这个工具' },
        { promptId: 'p2', brandPresent: false, competitorsMentioned: [], evidenceId: 'e2', provider: 'openai', answerText: '暂无推荐' },
      ],
      brand: 'metadocu',
      competitors: ['Rival'],
    })!
    expect(s.sov.find((x) => x.name === 'Rival')!.pct).toBe(50) // 2 样本 1 命中
  })

  it('SP-A2 #6：无 answerText 回退冻结 competitorsMentioned（不回归旧调用方）', () => {
    const s = aggregateProbeSummary({
      prompts,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: ['Rival'], evidenceId: 'e1' },
        { promptId: 'p2', brandPresent: false, competitorsMentioned: [], evidenceId: 'e2' },
      ],
      brand: 'metadocu',
      competitors: ['Rival'],
    })!
    expect(s.sov.find((x) => x.name === 'Rival')!.pct).toBe(50)
  })

  it('SP-A2 #6：分引擎 SoV 各引擎独立计（引擎不可互推）', () => {
    const s = aggregateProbeSummary({
      prompts,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: ['Notion'], evidenceId: 'e1', provider: 'openai' },
        { promptId: 'p2', brandPresent: false, competitorsMentioned: ['Notion'], evidenceId: 'e2', provider: 'openai' },
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e3', provider: 'perplexity' },
      ],
      brand: 'metadocu',
      competitors: ['Notion'],
    })!
    const openai = s.sovByEngine!.find((e) => e.engine === 'openai')!
    expect(openai.samples).toBe(2)
    expect(openai.sov.find((x) => x.name === 'Notion')!.pct).toBe(100) // openai 2/2
    const px = s.sovByEngine!.find((e) => e.engine === 'perplexity')!
    expect(px.samples).toBe(1)
    expect(px.sov.find((x) => x.name === 'Notion')!.pct).toBe(0) // perplexity 0/1
    expect(s.sovByEngine!.map((e) => e.engine)).toEqual(['openai', 'perplexity']) // samples 降序
  })

  it('keeps prompt order by priority and falls back sampleEvidenceId to the first result', () => {
    const s = aggregateProbeSummary({
      prompts: [prompts[2], prompts[0], prompts[1]],
      results: [result('p1', { evidenceId: 'ev_first' })],
      brand: 'metadocu',
      competitors: [],
    })!
    expect(s.perPrompt.map((p) => p.text)).toEqual(['推荐工具？', '替代品？', '靠谱吗？'])
    expect(s.sampleEvidenceId).toBe('ev_first')
  })
})

// D4：unbranded 层拆分 + Wilson 下限。
describe('aggregateProbeSummary — unbranded 层 (D4)', () => {
  const brandedPrompts = [
    { id: 'p1', text: '品牌直击？', priority: 0, branded: true },
    { id: 'p2', text: '推荐工具？', priority: 1, branded: false },
    { id: 'p3', text: '替代品？', priority: 2, branded: false },
  ]

  it('computes unbranded present/total on the unbranded prompt subset only', () => {
    const s = aggregateProbeSummary({
      prompts: brandedPrompts,
      results: [
        result('p1', { brandPresent: true }), // branded 问题命中——不计入 unbranded
        result('p2', { brandPresent: true }), // unbranded 命中
        result('p3'), // unbranded 未命中
      ],
      brand: 'metadocu',
      competitors: [],
    })!
    expect(s.unbranded.total).toBe(2) // p2、p3
    expect(s.unbranded.present).toBe(1) // 仅 p2
    expect(s.promptsTotal).toBe(3) // 既有字段全集口径不变
    expect(s.promptsPresent).toBe(2) // p1 + p2 都命中，全集口径不变
  })

  it('perEngine 额外携带 unbrandedPresent/unbrandedTotal（缺陷1修复：供 G06 门控用 unbranded 口径，不与全集口径混用）', () => {
    const s = aggregateProbeSummary({
      prompts: brandedPrompts,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1', provider: 'openai' }, // branded 复述，计入全集但不计入 unbranded
        { promptId: 'p2', brandPresent: true, competitorsMentioned: [], evidenceId: 'e2', provider: 'openai' }, // unbranded 命中
        { promptId: 'p3', brandPresent: false, competitorsMentioned: [], evidenceId: 'e3', provider: 'openai' }, // unbranded 未命中
      ],
      brand: 'metadocu',
      competitors: [],
    })!
    const openai = s.perEngine.find((e) => e.engine === 'openai')!
    expect(openai.promptsPresent).toBe(2) // 全集口径：p1 + p2
    expect(openai.promptsTotal).toBe(3) // 全集口径：p1 + p2 + p3
    expect(openai.unbrandedPresent).toBe(1) // unbranded 子集仅 p2 命中
    expect(openai.unbrandedTotal).toBe(2) // unbranded 子集为 p2、p3
  })

  it('wilsonLow is a lower bound strictly below the point estimate for small n', () => {
    const s = aggregateProbeSummary({
      prompts: brandedPrompts,
      results: [result('p1', { brandPresent: true }), result('p2', { brandPresent: true }), result('p3', { brandPresent: true })],
      brand: 'metadocu',
      competitors: [],
    })!
    expect(s.unbranded.total).toBe(2)
    expect(s.unbranded.present).toBe(2) // 100% 点估计
    expect(s.unbranded.wilsonLow).toBeGreaterThan(0)
    expect(s.unbranded.wilsonLow).toBeLessThan(1) // 小样本下限显著低于 100%
  })

  it('treats prompts without a branded flag as unbranded (legacy callers do not regress)', () => {
    const s = aggregateProbeSummary({
      prompts, // 旧 fixture：无 branded 字段
      results: [result('p1', { brandPresent: true }), result('p2'), result('p3')],
      brand: 'metadocu',
      competitors: [],
    })!
    expect(s.unbranded.total).toBe(3) // 全部视为 unbranded
    expect(s.unbranded.present).toBe(1)
  })

  it('SoV (sov + sovByEngine) only counts unbranded-subset results', () => {
    const s = aggregateProbeSummary({
      prompts: brandedPrompts,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1', provider: 'openai' }, // branded：应被排除在 sov 外
        { promptId: 'p2', brandPresent: false, competitorsMentioned: ['Notion'], evidenceId: 'e2', provider: 'openai' },
      ],
      brand: 'metadocu',
      competitors: ['Notion'],
    })!
    // 只剩 p2 一条 unbranded 样本：metadocu 0/1=0%，Notion 1/1=100%
    expect(s.sov).toEqual([
      { name: 'Notion', pct: 100, you: false },
      { name: 'metadocu', pct: 0, you: true },
    ])
    const openai = s.sovByEngine!.find((e) => e.engine === 'openai')!
    expect(openai.samples).toBe(1) // 只算 unbranded 的那一条，不含 branded 的 p1
  })

  it('perPrompt carries the branded flag through', () => {
    const s = aggregateProbeSummary({
      prompts: brandedPrompts,
      results: [result('p1', { brandPresent: true }), result('p2'), result('p3')],
      brand: 'metadocu',
      competitors: [],
    })!
    expect(s.perPrompt.map((p) => p.branded)).toEqual([true, false, false])
  })
})

// D3：branded 问题回答的认知质量三态判定，分引擎、按联网能力分流。
describe('aggregateProbeSummary — branded 三态判定 (D3)', () => {
  const onePrompt = [{ id: 'p1', text: `品牌是什么？`, priority: 0, branded: true }]

  it('online engine (webSearchEnabled=true): cited → grounded', () => {
    const s = aggregateProbeSummary({
      prompts: onePrompt,
      results: [
        {
          promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1',
          provider: 'openai', webSearchEnabled: true, citedUrls: ['https://metadocu.com/about'],
        },
      ],
      brand: 'metadocu', competitors: [],
    })!
    const openai = s.branded.perEngine.find((e) => e.provider === 'openai')!
    expect(openai.webSearchEnabled).toBe(true)
    expect(openai).toMatchObject({ grounded: 1, speculative: 0, unknown: 0, unverified: 0, undetermined: 0 })
  })

  it('online engine: no citation + hedged → speculative', () => {
    const s = aggregateProbeSummary({
      prompts: onePrompt,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1', provider: 'openai', webSearchEnabled: true, citedUrls: [], hedged: true },
      ],
      brand: 'metadocu', competitors: [],
    })!
    expect(s.branded.perEngine.find((e) => e.provider === 'openai')).toMatchObject({ speculative: 1, grounded: 0, unknown: 0, unverified: 0 })
  })

  it('online engine: no citation, no hedge, unknownAdmission → unknown', () => {
    const s = aggregateProbeSummary({
      prompts: onePrompt,
      results: [
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', provider: 'openai', webSearchEnabled: true, citedUrls: [], unknownAdmission: true },
      ],
      brand: 'metadocu', competitors: [],
    })!
    expect(s.branded.perEngine.find((e) => e.provider === 'openai')).toMatchObject({ unknown: 1, grounded: 0, speculative: 0, unverified: 0 })
  })

  it('online engine: no citation, no hedge, no admission → unverified (断言式回答无依据)', () => {
    const s = aggregateProbeSummary({
      prompts: onePrompt,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1', provider: 'openai', webSearchEnabled: true, citedUrls: [] },
      ],
      brand: 'metadocu', competitors: [],
    })!
    expect(s.branded.perEngine.find((e) => e.provider === 'openai')).toMatchObject({ unverified: 1, grounded: 0, speculative: 0, unknown: 0 })
  })

  it('DeepSeek (webSearchEnabled=false, via static fallback): empty citedUrls is NEVER read as "no grounding" — only speculative/unknown/undetermined', () => {
    const s = aggregateProbeSummary({
      prompts: onePrompt,
      results: [
        // 未显式传 webSearchEnabled——落到 provider 静态能力表兜底（deepseek=false）
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1', provider: 'deepseek', citedUrls: [], hedged: true },
      ],
      brand: 'metadocu', competitors: [],
    })!
    const deepseek = s.branded.perEngine.find((e) => e.provider === 'deepseek')!
    expect(deepseek.webSearchEnabled).toBe(false)
    expect(deepseek).toMatchObject({ speculative: 1, grounded: 0, unverified: 0, unknown: 0, undetermined: 0 })
  })

  it('DeepSeek: no hedge, no admission → undetermined（无引用能力，未判定），从不落 grounded/unverified', () => {
    const s = aggregateProbeSummary({
      prompts: onePrompt,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1', provider: 'deepseek', citedUrls: [] },
      ],
      brand: 'metadocu', competitors: [],
    })!
    const deepseek = s.branded.perEngine.find((e) => e.provider === 'deepseek')!
    expect(deepseek).toMatchObject({ undetermined: 1, grounded: 0, unverified: 0, speculative: 0, unknown: 0 })
  })

  it('unbranded-only results never enter the branded breakdown', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: '推荐工具？', priority: 0, branded: false }],
      results: [{ promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1', provider: 'openai', webSearchEnabled: true, citedUrls: [] }],
      brand: 'metadocu', competitors: [],
    })!
    expect(s.branded.perEngine).toEqual([])
  })
})

// D4：citationRate——联网引擎回答中 citedUrls 非空占比。
describe('aggregateProbeSummary — citationRate (D4)', () => {
  it('computes the fraction of online-engine answers that carry a citation', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', provider: 'openai', webSearchEnabled: true, citedUrls: ['https://x.com'] },
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e2', provider: 'openai', webSearchEnabled: true, citedUrls: [] },
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e3', provider: 'perplexity', webSearchEnabled: true, citedUrls: ['https://y.com'] },
      ],
      brand: 'metadocu', competitors: [],
    })!
    expect(s.citationRate).toBeCloseTo(2 / 3)
  })

  it('excludes memory-type (non-web-search) engines from the citation-rate denominator', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', provider: 'openai', webSearchEnabled: true, citedUrls: ['https://x.com'] },
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e2', provider: 'deepseek', citedUrls: [] },
      ],
      brand: 'metadocu', competitors: [],
    })!
    expect(s.citationRate).toBe(1) // deepseek 被排除在分母外，只剩 openai 1/1
  })

  it('defaults to 0 when there are no online-engine results', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [{ promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', provider: 'deepseek', citedUrls: [] }],
      brand: 'metadocu', competitors: [],
    })!
    expect(s.citationRate).toBe(0)
  })
})

// ⑤：被引用域名分布——citedDomains（域名→出现次数，标注 owned/third_party）。
describe('aggregateProbeSummary — citedDomains (⑤ 引用来源归属分类)', () => {
  it('counts cited-domain occurrences and classifies owned vs third_party when domain is provided', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', citedUrls: ['https://metadocu.com/about', 'https://notion.so/page'] },
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e2', citedUrls: ['https://docs.metadocu.com/guide'] },
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e3', citedUrls: ['https://notion.so/other'] },
      ],
      brand: 'metadocu', competitors: [], domain: 'metadocu.com',
    })!
    // metadocu.com 和 docs.metadocu.com 是同一自有域名的不同子域，按归一化 host 分列（不合并子域）；
    // count 并列时按域名字典序排（'docs...' < 'metadocu...'）。
    expect(s.citedDomains).toEqual([
      { domain: 'notion.so', count: 2, origin: 'third_party', platform: 'other' },
      { domain: 'docs.metadocu.com', count: 1, origin: 'owned', platform: 'other' },
      { domain: 'metadocu.com', count: 1, origin: 'owned', platform: 'other' },
    ])
  })

  it('normalizes www. and counts repeated citations of the same domain across samples', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', citedUrls: ['https://www.notion.so/a'] },
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e2', citedUrls: ['https://notion.so/b'] },
      ],
      brand: 'metadocu', competitors: [], domain: 'metadocu.com',
    })!
    expect(s.citedDomains).toEqual([{ domain: 'notion.so', count: 2, origin: 'third_party', platform: 'other' }])
  })

  it('ignores malformed cited URLs instead of producing an unsupported domain entry', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [{ promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', citedUrls: ['not a url', 'https://notion.so/a'] }],
      brand: 'metadocu', competitors: [], domain: 'metadocu.com',
    })!
    expect(s.citedDomains).toEqual([{ domain: 'notion.so', count: 1, origin: 'third_party', platform: 'other' }])
  })

  it('defaults every domain to third_party when the caller omits domain (cannot verify ownership, conservative)', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [{ promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', citedUrls: ['https://metadocu.com/about'] }],
      brand: 'metadocu', competitors: [],
    })!
    expect(s.citedDomains).toEqual([{ domain: 'metadocu.com', count: 1, origin: 'third_party', platform: 'other' }])
  })

  it('returns an empty array when no result carries a citedUrls entry', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [{ promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', citedUrls: [] }],
      brand: 'metadocu', competitors: [], domain: 'metadocu.com',
    })!
    expect(s.citedDomains).toEqual([])
  })

  it('classifies known community/reference platform domains via the platform field', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [
        { promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', citedUrls: ['https://www.reddit.com/r/seo', 'https://en.wikipedia.org/wiki/SEO'] },
      ],
      brand: 'metadocu', competitors: [], domain: 'metadocu.com',
    })!
    const byDomain = Object.fromEntries(s.citedDomains.map((d) => [d.domain, d]))
    expect(byDomain['reddit.com'].platform).toBe('reddit')
    expect(byDomain['en.wikipedia.org'].platform).toBe('wikipedia')
  })
})

// 社区/UGC 引用占比（新增）：cited 引用条数中落在社区/UGC 平台的占比，口径限定 unbranded 子集。
describe('aggregateProbeSummary — ugcCitationShare', () => {
  it('returns null when the unbranded citedUrls denominator is zero (no citations, not measured 0%)', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [{ promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', citedUrls: [] }],
      brand: 'metadocu', competitors: [],
    })!
    expect(s.ugcCitationShare).toBeNull()
  })

  it('computes the fraction of unbranded citedUrls landing on a UGC platform (reddit/quora/youtube/linkedin)', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [
        {
          promptId: 'p1',
          brandPresent: false,
          competitorsMentioned: [],
          evidenceId: 'e1',
          citedUrls: ['https://www.reddit.com/r/seo', 'https://metadocu.com/about', 'https://www.quora.com/x', 'https://notion.so/y'],
        },
      ],
      brand: 'metadocu', competitors: [],
    })!
    // 2 条 UGC（reddit + quora） / 4 条全部 cited = 0.5
    expect(s.ugcCitationShare).toBe(0.5)
  })

  it('returns 0 (not null) when there are unbranded citations but none land on a UGC platform', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [{ promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', citedUrls: ['https://notion.so/a', 'https://en.wikipedia.org/wiki/SEO'] }],
      brand: 'metadocu', competitors: [],
    })!
    expect(s.ugcCitationShare).toBe(0)
  })

  it('excludes citations from branded prompts (branded: true) from both numerator and denominator', () => {
    const s = aggregateProbeSummary({
      prompts: [
        { id: 'p1', text: 'branded q', priority: 0, branded: true },
        { id: 'p2', text: 'unbranded q', priority: 1, branded: false },
      ],
      results: [
        // branded 题下的 reddit 引用不应计入——即使占比很高，也不该混进"自然讨论面"信号。
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1', citedUrls: ['https://www.reddit.com/r/seo'] },
        { promptId: 'p2', brandPresent: false, competitorsMentioned: [], evidenceId: 'e2', citedUrls: ['https://notion.so/a'] },
      ],
      brand: 'metadocu', competitors: [],
    })!
    // 分母只认 p2（unbranded）的 1 条引用，notion.so 非 UGC → 0/1 = 0，不是 1/2。
    expect(s.ugcCitationShare).toBe(0)
  })

  it('ignores malformed URLs when computing the denominator (same rule as citedDomains)', () => {
    const s = aggregateProbeSummary({
      prompts: [{ id: 'p1', text: 'x', priority: 0 }],
      results: [{ promptId: 'p1', brandPresent: false, competitorsMentioned: [], evidenceId: 'e1', citedUrls: ['not a url', 'https://www.reddit.com/r/seo'] }],
      brand: 'metadocu', competitors: [],
    })!
    // 畸形 URL 被忽略：分母只剩 1 条（reddit），占比 = 1/1 = 1。
    expect(s.ugcCitationShare).toBe(1)
  })
})
