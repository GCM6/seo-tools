import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
import { RULES_VERSION } from '../types'
import type { ProbeSummary } from '@/lib/probes/summary'
import { geoRules } from './geo'

// 缺陷4：G05/G06 语义已变 + 新增 G10，规则库版本必须随之升版，否则跨版本回测检测
// （lib/diagnosis/rule-proposals.ts 的 rulesVersionDelta）永远收不到旧协议 run 的告警。
describe('RULES_VERSION', () => {
  it('已随新增 G11/SP01/SP02 升版为 rules_v4', () => {
    expect(RULES_VERSION).toBe('rules_v4')
  })
})

const rule = (id: string) => geoRules.find((r) => r.id === id)!

const baseCtx = (): RuleContext => ({
  project: { domain: 'example.com', industry: '', market: 'US', language: 'en', competitors: [] },
  siteAudit: null,
  entryPage: null,
  renderChecks: [],
  schemas: [],
  probe: null,
  probeEvidenceId: null,
  robotsText: null,
  psiChecks: [],
  keywordMetrics: [],
  queryPageMetrics: [],
  dataforseo: { configured: false, serpByKeyword: [], keywordData: [], backlinks: [], bingIndex: null, brandSerp: null },
  confirmedCompetitors: [],
  keywordGaps: [],
  uaProbe: null,
  thirdParty: null,
  socialPresence: null,
})

// G05 helper：直接构造 unbranded 层（present/total），wilsonLow 用真实公式算，避免断言脱离真实实现。
function unbrandedProbe(present: number, total: number): ProbeSummary {
  const phat = total > 0 ? present / total : 0
  const z = 1.96
  const z2 = z * z
  const denom = total > 0 ? 1 + z2 / total : 1
  const centre = phat + (total > 0 ? z2 / (2 * total) : 0)
  const margin = total > 0 ? z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total) : 0
  const wilsonLow = total > 0 ? Math.max(0, (centre - margin) / denom) : 0
  return {
    promptsTotal: total,
    promptsPresent: present,
    totalSamples: total,
    perPrompt: [],
    sov: [],
    perEngine: [],
    sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 },
    sampleEvidenceId: 'ev',
    unbranded: { present, total, wilsonLow },
    branded: { perEngine: [] },
    citationRate: 0, citedDomains: [], ugcCitationShare: null,
  }
}

// G06 helper：按引擎构造 perEngine 可见度（用于校验 online-only 过滤），branded.perEngine 提供
// webSearchEnabled 判定所需的分引擎联网能力标注（D6）。
// 缺陷1/2修复后：这些测试场景本身不含 branded 题（无 branded 字段的旧式调用不回归，全部计入
// unbranded），所以 unbrandedPresent/unbrandedTotal 直接等同各引擎的 promptsPresent/promptsTotal；
// 全局 unbranded.total 取各引擎 promptsTotal 的最大值（同一固定协议下各引擎应问同一批去重问题数）。
function engineProbe(
  engines: { engine: string; promptsPresent: number; promptsTotal: number; webSearchEnabled: boolean }[],
): ProbeSummary {
  const unbrandedTotal = engines.length ? Math.max(...engines.map((e) => e.promptsTotal)) : 0
  return {
    promptsTotal: engines.reduce((s, e) => s + e.promptsTotal, 0),
    promptsPresent: engines.reduce((s, e) => s + e.promptsPresent, 0),
    totalSamples: engines.reduce((s, e) => s + e.promptsTotal, 0),
    perPrompt: [],
    sov: [],
    perEngine: engines.map((e) => ({
      engine: e.engine,
      promptsPresent: e.promptsPresent,
      promptsTotal: e.promptsTotal,
      samples: e.promptsTotal,
      unbrandedPresent: e.promptsPresent,
      unbrandedTotal: e.promptsTotal,
    })),
    sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 },
    sampleEvidenceId: 'ev',
    unbranded: { present: 0, total: unbrandedTotal, wilsonLow: 0 },
    branded: {
      perEngine: engines.map((e) => ({
        provider: e.engine,
        webSearchEnabled: e.webSearchEnabled,
        grounded: 0,
        speculative: 0,
        unknown: 0,
        unverified: 0,
        undetermined: 0,
      })),
    },
    citationRate: 0, citedDomains: [], ugcCitationShare: null,
  }
}

// G10 helper：直接构造 branded.perEngine 三态计数（跨引擎合计判定，聚合逻辑不关心具体引擎名）。
function brandedProbe(counts: { grounded?: number; speculative?: number; unknown?: number; unverified?: number; undetermined?: number }[]): ProbeSummary {
  return {
    promptsTotal: 0,
    promptsPresent: 0,
    totalSamples: 0,
    perPrompt: [],
    sov: [],
    perEngine: [],
    sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 },
    sampleEvidenceId: 'ev',
    unbranded: { present: 0, total: 0, wilsonLow: 0 },
    branded: {
      perEngine: counts.map((c, i) => ({
        provider: `engine${i}`,
        webSearchEnabled: true,
        grounded: c.grounded ?? 0,
        speculative: c.speculative ?? 0,
        unknown: c.unknown ?? 0,
        unverified: c.unverified ?? 0,
        undetermined: c.undetermined ?? 0,
      })),
    },
    citationRate: 0, citedDomains: [], ugcCitationShare: null,
  }
}

describe('G03 render dependency (GEO framing)', () => {
  it('hits same render-dependent pages as T10', () => {
    const ctx = baseCtx()
    ctx.renderChecks = [
      { id: 'rc1', source: 'https://example.com/a', sitePageId: null, initialChars: 50, renderedChars: 1000, delta: 950, renderedText: '' },
    ]
    const hits = rule('G03').evaluate(ctx) as RuleHitDraft[]
    expect(hits[0].evidenceRefs).toEqual(['rc1'])
    expect(hits[0].description).toContain('AI 抓取链路不可见')
  })
  it('null when no render dependency', () => {
    expect(rule('G03').evaluate(baseCtx())).toBeNull()
  })
})

describe('G05 low AI visibility (D5：改用 unbranded 层口径)', () => {
  it('hits when unbranded ratio < 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = unbrandedProbe(1, 5) // 1/5 = 0.2
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G05').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['pe1'])
    expect(hit.detail!.directional).toBe(true)
    expect(hit.detail!.present).toBe(1)
    expect(hit.detail!.total).toBe(5)
    expect(hit.detail!.wilsonLow).toBeGreaterThanOrEqual(0)
    expect(hit.description).toContain('无品牌提问中')
    expect(hit.description).toContain('Wilson')
  })
  it('null when unbranded ratio >= 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = unbrandedProbe(2, 5) // 2/5 = 0.4
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G05').evaluate(ctx)).toBeNull()
  })
  it('null when no probe evidence', () => {
    const ctx = baseCtx()
    ctx.probe = unbrandedProbe(1, 5)
    ctx.probeEvidenceId = null
    expect(rule('G05').evaluate(ctx)).toBeNull()
  })
  it('no-op when unbranded.total === 0 且 promptsTotal 也为 0（真无数据，非全 branded 场景）', () => {
    const ctx = baseCtx()
    ctx.probe = unbrandedProbe(0, 0)
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G05').evaluate(ctx)).toBeNull()
  })
  it('缺陷3修复：unbranded.total===0 但 promptsTotal>0（品牌名与行业词同形，探针问题全部被标 branded）——' +
    '产出降级 inferred finding，而非静默 null 让整组 GEO 可见度诊断消失', () => {
    const ctx = baseCtx()
    ctx.probe = {
      promptsTotal: 30,
      promptsPresent: 30,
      totalSamples: 30,
      perPrompt: [],
      sov: [],
      perEngine: [],
      sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 },
      sampleEvidenceId: 'ev',
      unbranded: { present: 0, total: 0, wilsonLow: 0 },
      branded: { perEngine: [] },
      citationRate: 0, citedDomains: [], ugcCitationShare: null,
    }
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G05').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.claimType).toBe('inferred')
    expect(hit.evidenceRefs).toEqual(['pe1'])
    expect(hit.detail!.promptsTotal).toBe(30)
    expect(hit.detail!.unbrandedTotal).toBe(0)
    // 不得伪造召回数字：只陈述"无法评估"，不出现虚构的 present/ratio 数字
    expect(hit.description).toContain('30')
    expect(hit.title).toContain('无法评估')
  })
  it('混合 branded/unbranded 数据下不再被品牌题拉高：branded 题全命中不影响 unbranded 判定', () => {
    // 30 题里 8 题 branded（模型复述品牌名，恒命中，若走旧的 promptsPresent/promptsTotal 全集口径
    // 会把可见度拉高到 8/22≈36%≥30% 而误判「达标」）；unbranded 层单独只 2/22≈9%，应正确触发。
    const ctx = baseCtx()
    ctx.probe = unbrandedProbe(2, 22)
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G05').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.detail!.ratio).toBeCloseTo(2 / 22, 5)
  })
})

describe('G06 zero citation (D5：只评估 webSearchEnabled=true 的检索型引擎)', () => {
  it('hits when online engines are all zero', () => {
    const ctx = baseCtx()
    ctx.probe = engineProbe([{ engine: 'openai', promptsPresent: 0, promptsTotal: 5, webSearchEnabled: true }])
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G06').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['pe1'])
    expect(hit.detail!.engines).toEqual(['openai'])
  })
  it('null when an online engine has at least one presence', () => {
    const ctx = baseCtx()
    ctx.probe = engineProbe([{ engine: 'openai', promptsPresent: 1, promptsTotal: 5, webSearchEnabled: true }])
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G06').evaluate(ctx)).toBeNull()
  })
  it('DeepSeek（记忆型，webSearchEnabled=false）零出现不触发 G06——只有检索型引擎参与判定', () => {
    const ctx = baseCtx()
    ctx.probe = engineProbe([
      { engine: 'openai', promptsPresent: 1, promptsTotal: 5, webSearchEnabled: true },
      { engine: 'deepseek', promptsPresent: 0, promptsTotal: 5, webSearchEnabled: false },
    ])
    ctx.probeEvidenceId = 'pe1'
    // openai（检索型）非零 → 即便 deepseek（记忆型）恒零，也不应触发/加重
    expect(rule('G06').evaluate(ctx)).toBeNull()
  })
  it('DeepSeek 零出现且无其他检索型引擎数据时，规则整体 no-op（不会单靠记忆型引擎的零值触发）', () => {
    const ctx = baseCtx()
    ctx.probe = engineProbe([{ engine: 'deepseek', promptsPresent: 0, promptsTotal: 5, webSearchEnabled: false }])
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G06').evaluate(ctx)).toBeNull()
  })
  it('全部检索型引擎均为零时仍触发，且 detail.engines 只含检索型', () => {
    const ctx = baseCtx()
    ctx.probe = engineProbe([
      { engine: 'openai', promptsPresent: 0, promptsTotal: 5, webSearchEnabled: true },
      { engine: 'perplexity', promptsPresent: 0, promptsTotal: 5, webSearchEnabled: true },
      { engine: 'deepseek', promptsPresent: 0, promptsTotal: 5, webSearchEnabled: false },
    ])
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G06').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.detail!.engines).toEqual(['openai', 'perplexity'])
    // 缺陷2修复：分母是去重后的问题数（5），不是 2 个联网引擎 × 5 题 = 10（旧语义误把引擎×问题
    // 配对数当成"探针问题数"）；配对数如需保留改名放 detail.enginePromptPairs，不再顶用 promptsTotal 之名。
    expect(hit.detail!.promptsTotal).toBe(5)
    expect(hit.detail!.enginePromptPairs).toBe(10)
    expect(hit.description).toContain('全部 5 个无品牌探针问题')
  })

  it('缺陷1修复的真实形态：branded 7 题必然复述品牌名使全集 promptsPresent=7≠0，但 unbranded 0/23——' +
    '旧口径（用全集 promptsPresent 门控）会误判为「已达标」而永远不触发；新口径正确触发', () => {
    const ctx = baseCtx()
    ctx.probe = {
      promptsTotal: 30,
      promptsPresent: 7, // 全集口径：7 个 branded 题全部命中（复述品牌名），非 0
      totalSamples: 30,
      perPrompt: [],
      sov: [],
      perEngine: [
        // 全集 promptsPresent/promptsTotal 沿用旧口径（含 branded），但 unbrandedPresent=0——
        // 无品牌提问下，检索型引擎从未主动召回/引用品牌。
        { engine: 'openai', promptsPresent: 7, promptsTotal: 30, samples: 30, unbrandedPresent: 0, unbrandedTotal: 23 },
      ],
      sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 },
      sampleEvidenceId: 'ev',
      unbranded: { present: 0, total: 23, wilsonLow: 0 },
      branded: {
        perEngine: [
          { provider: 'openai', webSearchEnabled: true, grounded: 0, speculative: 0, unknown: 0, unverified: 0, undetermined: 0 },
        ],
      },
      citationRate: 0, citedDomains: [], ugcCitationShare: null,
    }
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G06').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.detail!.promptsTotal).toBe(23)
    expect(hit.detail!.enginePromptPairs).toBe(30)
    expect(hit.evidenceRefs).toEqual(['pe1'])
  })
})

describe('G10 AI 疑似在编造品牌事实', () => {
  it('hits when speculative ratio >= 0.3 and total >= 3（跨引擎合计）', () => {
    const ctx = baseCtx()
    // 合计 grounded1 + speculative3 + unverified1 = 5，speculative 3/5=0.6
    ctx.probe = brandedProbe([{ grounded: 1, speculative: 3, unverified: 1 }])
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G10').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(rule('G10').claimType).toBe('inferred')
    expect(hit.evidenceRefs).toEqual(['pe1'])
    expect(hit.detail!.total).toBe(5)
    expect(hit.detail!.speculative).toBe(3)
    expect(hit.description).toContain('疑似')
    expect(hit.description).toContain('漏检')
  })
  it('跨引擎合计触发：单引擎不足阈值，但合计后达标', () => {
    const ctx = baseCtx()
    ctx.probe = brandedProbe([
      { grounded: 1, speculative: 1 }, // engine0: 1/2
      { grounded: 0, speculative: 2 }, // engine1: 2/2
    ])
    // 合计：grounded 1 + speculative 3 = 4，speculative 3/4=0.75 ≥ 0.3
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G10').evaluate(ctx)).not.toBeNull()
  })
  it('null when speculative ratio < 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = brandedProbe([{ grounded: 4, speculative: 1 }]) // 1/5=0.2
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G10').evaluate(ctx)).toBeNull()
  })
  it('null when total branded answers < 3（样本量门槛）', () => {
    const ctx = baseCtx()
    ctx.probe = brandedProbe([{ speculative: 2 }]) // 2/2=1.0 但 total=2 < 3
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G10').evaluate(ctx)).toBeNull()
  })
  it('undetermined（记忆型引擎无法判定）计入分母但不计入分子，不会被它拉高比例', () => {
    const ctx = baseCtx()
    // grounded 0 + speculative 1 + undetermined 3 = 4，speculative 1/4=0.25 < 0.3 → 不触发
    ctx.probe = brandedProbe([{ speculative: 1, undetermined: 3 }])
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G10').evaluate(ctx)).toBeNull()
  })
  it('null when no branded answers at all', () => {
    const ctx = baseCtx()
    ctx.probe = brandedProbe([])
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G10').evaluate(ctx)).toBeNull()
  })
  it('null when no probe or no probeEvidenceId', () => {
    const ctx = baseCtx()
    ctx.probe = brandedProbe([{ speculative: 3, grounded: 2 }])
    ctx.probeEvidenceId = null
    expect(rule('G10').evaluate(ctx)).toBeNull()
    const ctx2 = baseCtx()
    ctx2.probe = null
    ctx2.probeEvidenceId = 'pe1'
    expect(rule('G10').evaluate(ctx2)).toBeNull()
  })
})

// G11 helper：只需 ugcCitationShare + citedDomains，其余字段沿用 unbrandedProbe 的中性默认。
function ugcProbe(
  ugcCitationShare: number | null,
  citedDomains: { domain: string; count: number; origin: 'owned' | 'third_party'; platform: 'reddit' | 'youtube' | 'linkedin' | 'quora' | 'wikipedia' | 'github' | 'other' }[],
): ProbeSummary {
  const base = unbrandedProbe(0, 0)
  return { ...base, citedDomains, ugcCitationShare }
}

describe('G11 UGC/社区引用占比过高且未引用本站', () => {
  it('warning when ugcCitationShare >= 0.25 and no owned citation', () => {
    const ctx = baseCtx()
    ctx.probe = ugcProbe(0.4, [
      { domain: 'reddit.com', count: 2, origin: 'third_party', platform: 'reddit' },
      { domain: 'youtube.com', count: 1, origin: 'third_party', platform: 'youtube' },
    ])
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G11').evaluate(ctx) as RuleHitDraft
    expect(hit).not.toBeNull()
    expect(hit.evidenceRefs).toEqual(['pe1'])
    expect(rule('G11').claimType).toBe('measured_sample')
    expect(hit.detail!.ugcCitationShare).toBe(0.4)
    expect(hit.description).toContain('40%')
    expect(hit.description).toMatch(/reddit|youtube/)
  })
  it('null when ugcCitationShare below threshold', () => {
    const ctx = baseCtx()
    ctx.probe = ugcProbe(0.1, [{ domain: 'reddit.com', count: 1, origin: 'third_party', platform: 'reddit' }])
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G11').evaluate(ctx)).toBeNull()
  })
  it('null when an owned citation exists even if ugcCitationShare is high', () => {
    const ctx = baseCtx()
    ctx.probe = ugcProbe(0.6, [
      { domain: 'reddit.com', count: 2, origin: 'third_party', platform: 'reddit' },
      { domain: 'example.com', count: 1, origin: 'owned', platform: 'other' },
    ])
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G11').evaluate(ctx)).toBeNull()
  })
  it('null when ugcCitationShare is null (no cited sample)', () => {
    const ctx = baseCtx()
    ctx.probe = ugcProbe(null, [])
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G11').evaluate(ctx)).toBeNull()
  })
  it('null when no probe or no probeEvidenceId', () => {
    const ctx = baseCtx()
    ctx.probe = ugcProbe(0.5, [{ domain: 'reddit.com', count: 1, origin: 'third_party', platform: 'reddit' }])
    ctx.probeEvidenceId = null
    expect(rule('G11').evaluate(ctx)).toBeNull()
  })
})

const entry = (): RuleContext['entryPage'] => ({
  id: 'ep1',
  rawHtml: '',
  canonicalUrl: null,
  metaRobots: null,
  robotsAllowed: true,
})

describe('G01 AI crawler blocked by robots', () => {
  it('error when a search crawler is disallowed', () => {
    const ctx = baseCtx()
    ctx.entryPage = entry()
    ctx.robotsText = 'User-agent: PerplexityBot\nDisallow: /'
    const hits = rule('G01').evaluate(ctx) as RuleHitDraft[]
    const err = hits.find((h) => h.severity === 'error')!
    expect(err).toBeTruthy()
    expect(err.evidenceRefs).toEqual(['ep1'])
    expect(err.scope).toBe('geo:robots')
    expect(err.detail!.blocked as string[]).toContain('PerplexityBot')
  })
  it('only a notice when a training crawler is disallowed', () => {
    const ctx = baseCtx()
    ctx.entryPage = entry()
    ctx.robotsText = 'User-agent: GPTBot\nDisallow: /'
    const hits = rule('G01').evaluate(ctx) as RuleHitDraft[]
    expect(hits).toHaveLength(1)
    expect(hits[0].severity).toBe('notice')
    expect(hits[0].detail!.blocked as string[]).toContain('GPTBot')
  })
  it('emits both an error and a notice when both kinds blocked', () => {
    const ctx = baseCtx()
    ctx.entryPage = entry()
    ctx.robotsText = 'User-agent: *\nDisallow: /'
    const hits = rule('G01').evaluate(ctx) as RuleHitDraft[]
    expect(hits.some((h) => h.severity === 'error')).toBe(true)
    expect(hits.some((h) => h.severity === 'notice')).toBe(true)
  })
  it('null when all crawlers allowed', () => {
    const ctx = baseCtx()
    ctx.entryPage = entry()
    ctx.robotsText = 'User-agent: *\nDisallow: /private'
    expect(rule('G01').evaluate(ctx)).toBeNull()
  })
  it('null when robotsText empty or missing entry page', () => {
    const ctx = baseCtx()
    ctx.robotsText = null
    ctx.entryPage = entry()
    expect(rule('G01').evaluate(ctx)).toBeNull()
    const ctx2 = baseCtx()
    ctx2.robotsText = 'User-agent: PerplexityBot\nDisallow: /'
    ctx2.entryPage = null
    expect(rule('G01').evaluate(ctx2)).toBeNull()
  })
})

const schema = (s: Partial<RuleContext['schemas'][number]>): RuleContext['schemas'][number] => ({
  id: 's1',
  source: 'entry',
  sitePageId: null,
  types: [],
  sameAs: [],
  raw: [],
  blocks: [],
  ...s,
})

describe('E01 Organization schema missing authoritative sameAs', () => {
  it('notice when Organization has empty sameAs', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ id: 'sc1', types: ['Organization'], sameAs: [] })]
    const hit = rule('E01').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['sc1'])
    expect(hit.scope).toBe('geo:entity')
    expect(rule('E01').severity).toBe('notice')
    expect(hit.description).toContain('Bing')
  })
  it('notice when sameAs points to no authority node', () => {
    const ctx = baseCtx()
    ctx.schemas = [
      schema({ id: 'sc1', types: ['Organization'], sameAs: ['https://example.com/about'] }),
    ]
    const hit = rule('E01').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['sc1'])
    expect(hit.detail!.reason).toBe('no_authority')
  })
  it('null when sameAs points to an authority node', () => {
    const ctx = baseCtx()
    ctx.schemas = [
      schema({ id: 'sc1', types: ['Organization'], sameAs: ['https://www.wikidata.org/wiki/Q42'] }),
    ]
    expect(rule('E01').evaluate(ctx)).toBeNull()
  })
  it('null when no Organization-like schema present', () => {
    const ctx = baseCtx()
    ctx.schemas = [schema({ id: 'sc1', types: ['Product'], sameAs: [] })]
    expect(rule('E01').evaluate(ctx)).toBeNull()
  })
})

const uaProbe = (
  crawlers: NonNullable<RuleContext['uaProbe']>['crawlers'],
  llmsExists = false,
): NonNullable<RuleContext['uaProbe']> => ({
  crawlers,
  llmsTxt: { exists: llmsExists, url: 'https://example.com/llms.txt' },
  evidenceId: 'ua1',
})

describe('G02 CDN/WAF blocks search AI crawler', () => {
  it('error when a search crawler is blocked at the transport layer', () => {
    const ctx = baseCtx()
    ctx.uaProbe = uaProbe([
      { ua: 'OAI-SearchBot', kind: 'search', url: 'https://example.com/', status: 403, blocked: true },
    ])
    const hit = rule('G02').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['ua1'])
    expect(hit.scope).toBe('geo:cdn')
    expect(rule('G02').claimType).toBe('measured_hard')
    const blocked = hit.detail!.blocked as { ua: string; url: string; status: number | null }[]
    expect(blocked[0]).toMatchObject({ ua: 'OAI-SearchBot', url: 'https://example.com/', status: 403 })
    // 与 robots 屏蔽（G01）区分措辞
    expect(hit.description).toContain('CDN/WAF')
  })
  it('does not report when only a training crawler is blocked', () => {
    const ctx = baseCtx()
    ctx.uaProbe = uaProbe([
      { ua: 'GPTBot', kind: 'training', url: 'https://example.com/', status: 403, blocked: true },
      { ua: 'OAI-SearchBot', kind: 'search', url: 'https://example.com/', status: 200, blocked: false },
    ])
    expect(rule('G02').evaluate(ctx)).toBeNull()
  })
  it('null when no crawler blocked', () => {
    const ctx = baseCtx()
    ctx.uaProbe = uaProbe([
      { ua: 'OAI-SearchBot', kind: 'search', url: 'https://example.com/', status: 200, blocked: false },
    ])
    expect(rule('G02').evaluate(ctx)).toBeNull()
  })
  it('null when uaProbe is null', () => {
    expect(rule('G02').evaluate(baseCtx())).toBeNull()
  })
})

describe('G08 llms.txt presence (record only)', () => {
  it('notice when llms.txt exists', () => {
    const ctx = baseCtx()
    ctx.uaProbe = uaProbe([], true)
    const hit = rule('G08').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['ua1'])
    expect(hit.scope).toBe('geo:llmstxt')
    expect(rule('G08').severity).toBe('notice')
    expect(rule('G08').claimType).toBe('measured_hard')
    expect(hit.detail!.exists).toBe(true)
    expect(hit.description).toContain('无证据')
  })
  it('null when llms.txt absent (avoid noise)', () => {
    const ctx = baseCtx()
    ctx.uaProbe = uaProbe([], false)
    expect(rule('G08').evaluate(ctx)).toBeNull()
  })
  it('null when uaProbe is null', () => {
    expect(rule('G08').evaluate(baseCtx())).toBeNull()
  })
})

const thirdParty = (
  wikiExists: boolean,
  redditMentions: number,
  windowDays = 365,
): NonNullable<RuleContext['thirdParty']> => ({
  wikipedia: { exists: wikiExists, title: wikiExists ? 'Example' : null, url: wikiExists ? 'https://en.wikipedia.org/wiki/Example' : null },
  reddit: { mentions: redditMentions, windowDays },
  evidenceId: 'tp1',
})

describe('G07 third-party corpus absence', () => {
  it('warning when no wikipedia AND reddit below threshold', () => {
    const ctx = baseCtx()
    ctx.thirdParty = thirdParty(false, 1)
    const hit = rule('G07').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['tp1'])
    expect(hit.scope).toBe('geo:thirdparty')
    expect(rule('G07').claimType).toBe('measured_sample')
    expect(hit.description).toContain('0.664')
  })
  it('null when wikipedia exists (signal met)', () => {
    const ctx = baseCtx()
    ctx.thirdParty = thirdParty(true, 0)
    expect(rule('G07').evaluate(ctx)).toBeNull()
  })
  it('null when reddit mentions at threshold (boundary, signal met)', () => {
    const ctx = baseCtx()
    ctx.thirdParty = thirdParty(false, 3) // === threshold, counts as enough
    expect(rule('G07').evaluate(ctx)).toBeNull()
  })
  it('warning at boundary just below threshold', () => {
    const ctx = baseCtx()
    ctx.thirdParty = thirdParty(false, 2)
    expect(rule('G07').evaluate(ctx)).not.toBeNull()
  })
  it('null when thirdParty is null', () => {
    expect(rule('G07').evaluate(baseCtx())).toBeNull()
  })
})

const probeSentiment = (s: Partial<ProbeSummary['sentiment']>): ProbeSummary => ({
  promptsTotal: 5,
  promptsPresent: 5,
  totalSamples: 5,
  perPrompt: [],
  sov: [],
  perEngine: [],
  sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0, ...s },
  sampleEvidenceId: 'ev',
  // D4（GEO branded/unbranded 重设计）：新增必填字段，G09 情感分布测试与这三项无关，给中性默认值。
  unbranded: { present: 0, total: 0, wilsonLow: 0 },
  branded: { perEngine: [] },
  citationRate: 0, citedDomains: [], ugcCitationShare: null,
})

describe('G09 negative citation sentiment', () => {
  it('warning when negative ratio >= 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = probeSentiment({ negative: 2, neutral: 3, total: 5 }) // 0.4
    ctx.probeEvidenceId = 'pe1'
    const hit = rule('G09').evaluate(ctx) as RuleHitDraft
    expect(hit.evidenceRefs).toEqual(['pe1'])
    expect(hit.scope).toBe('geo:sentiment')
    expect(rule('G09').claimType).toBe('inferred')
    expect(hit.detail!.negative).toBe(2)
    expect(hit.detail!.directional).toBe(true)
  })
  it('hits at exact boundary ratio 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = probeSentiment({ negative: 3, neutral: 7, total: 10 }) // 0.3
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G09').evaluate(ctx)).not.toBeNull()
  })
  it('null when negative ratio below 0.3', () => {
    const ctx = baseCtx()
    ctx.probe = probeSentiment({ negative: 1, neutral: 4, total: 5 }) // 0.2
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G09').evaluate(ctx)).toBeNull()
  })
  it('null when total === 0', () => {
    const ctx = baseCtx()
    ctx.probe = probeSentiment({ total: 0 })
    ctx.probeEvidenceId = 'pe1'
    expect(rule('G09').evaluate(ctx)).toBeNull()
  })
  it('null when probe or probeEvidenceId is null', () => {
    const ctx = baseCtx()
    ctx.probe = probeSentiment({ negative: 3, total: 5 })
    ctx.probeEvidenceId = null
    expect(rule('G09').evaluate(ctx)).toBeNull()
    const ctx2 = baseCtx()
    ctx2.probe = null
    ctx2.probeEvidenceId = 'pe1'
    expect(rule('G09').evaluate(ctx2)).toBeNull()
  })
})
