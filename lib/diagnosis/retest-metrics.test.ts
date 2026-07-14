import { describe, it, expect } from 'vitest'
import type { ValidationSpec } from './validation-spec'
import type { ProbeSummary } from '@/lib/probes/summary'
import {
  extractMetricTarget,
  extractRunMetric,
  buildMetricPair,
  buildProbeMetricRows,
  checkUnbrandedComparability,
  type RunMetrics,
} from './retest-metrics'

const spec = (o: Partial<ValidationSpec>): ValidationSpec => ({
  metricSource: 'gsc', metric: 'impressions', scope: 'site', direction: 'increase', windowDays: 28, ...o,
})
const probe = (o: Partial<ProbeSummary>): ProbeSummary => ({
  promptsTotal: 10, promptsPresent: 3, totalSamples: 50, perPrompt: [], sov: [], perEngine: [],
  sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 }, sampleEvidenceId: null,
  // D5（Wave 2-A）：brand_presence 已切到 unbranded 层口径，测试按用例显式传 unbranded；
  // 不传时给中性默认值（present/total 均 0，代表「未标注 unbranded 分母」）。
  unbranded: { present: 0, total: 0, wilsonLow: 0 }, branded: { perEngine: [] }, citationRate: 0, ...o,
})
// 缺省 brandedPromptCount/parserVersions 给中性默认值（两轮一致 → 不触发缺陷1 口径不可比守卫）。
const run = (o: Partial<RunMetrics>): RunMetrics => ({
  probe: null,
  gscKeywords: [],
  brandedPromptCount: 0,
  parserVersions: ['v4'],
  ...o,
})

describe('extractMetricTarget', () => {
  it('从 detail.keywords 抽 text', () => {
    expect(extractMetricTarget({ keywords: [{ text: 'widget' }, { text: 'gadget' }] })).toEqual({ keywords: ['widget', 'gadget'] })
  })
  it('从 detail.queries 抽 query', () => {
    expect(extractMetricTarget({ queries: [{ query: 'buy widget' }] })).toEqual({ keywords: ['buy widget'] })
  })
  it('无 detail / 无关键词 → null', () => {
    expect(extractMetricTarget(undefined)).toBeNull()
    expect(extractMetricTarget({ url: 'https://x' })).toBeNull()
  })
})

describe('extractRunMetric', () => {
  it('probe/brand_sov 取本品牌 pct', () => {
    const r = run({ probe: probe({ sov: [{ name: 'you', pct: 18, you: true }, { name: 'comp', pct: 40, you: false }] }) })
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_sov' }), r, null)).toBe(18)
  })
  it('probe/brand_sov 无本品牌条目 → null', () => {
    const r = run({ probe: probe({ sov: [{ name: 'comp', pct: 40, you: false }] }) })
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_sov' }), r, null)).toBeNull()
  })
  it('probe/brand_presence 取 unbranded 层比值（D5：不再用全集 promptsPresent/promptsTotal）', () => {
    const r = run({ probe: probe({ unbranded: { present: 4, total: 10, wilsonLow: 0.2 } }) })
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_presence' }), r, null)).toBe(0.4)
  })
  it('probe/brand_presence 混合 branded/unbranded 数据下不再被品牌题拉高', () => {
    // promptsPresent/promptsTotal（全集口径）= 8/10，若仍用旧口径会算出 0.8；
    // 但 unbranded 层单独只 1/6，应取到 1/6 而非 0.8。
    const r = run({ probe: probe({ promptsTotal: 10, promptsPresent: 8, unbranded: { present: 1, total: 6, wilsonLow: 0 } }) })
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_presence' }), r, null)).toBeCloseTo(1 / 6, 5)
  })
  it('probe/brand_presence unbranded.total === 0 → null', () => {
    const r = run({ probe: probe({ unbranded: { present: 0, total: 0, wilsonLow: 0 } }) })
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_presence' }), r, null)).toBeNull()
  })
  it('probe 源无 probe → null', () => {
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_sov' }), run({}), null)).toBeNull()
  })
  it('gsc/impressions 按目标关键词求和（大小写/空格归一）', () => {
    const r = run({ gscKeywords: [
      { keyText: 'Widget', impressions: 100, position: 5 },
      { keyText: 'gadget', impressions: 30, position: 8 },
      { keyText: 'other', impressions: 999, position: 2 },
    ] })
    expect(extractRunMetric(spec({}), r, { keywords: [' widget ', 'gadget'] })).toBe(130)
  })
  it('gsc/position 按目标关键词取平均排名（位次类 K02/K06）', () => {
    const r = run({ gscKeywords: [
      { keyText: 'Widget', impressions: 100, position: 4 },
      { keyText: 'gadget', impressions: 30, position: 8 },
      { keyText: 'other', impressions: 999, position: 2 },
    ] })
    // 命中 widget(4) + gadget(8) → 平均 6
    expect(extractRunMetric(spec({ metric: 'position', direction: 'decrease' }), r, { keywords: ['widget', 'gadget'] })).toBe(6)
  })
  it('gsc 目标为 null / 无命中 → null', () => {
    const r = run({ gscKeywords: [{ keyText: 'a', impressions: 5, position: 3 }] })
    expect(extractRunMetric(spec({}), r, null)).toBeNull()
    expect(extractRunMetric(spec({}), r, { keywords: ['zzz'] })).toBeNull()
  })
  it('未知 metric / crawl 源 → null', () => {
    expect(extractRunMetric(spec({ metricSource: 'crawl', metric: 'affected_pages' }), run({}), null)).toBeNull()
    expect(extractRunMetric(spec({ metricSource: 'gsc', metric: 'position' }), run({}), { keywords: ['a'] })).toBeNull()
  })
})

describe('buildMetricPair', () => {
  it('两侧有 → pair', () => {
    const b = run({ gscKeywords: [{ keyText: 'a', impressions: 10, position: 3 }] })
    const r = run({ gscKeywords: [{ keyText: 'a', impressions: 40, position: 2 }] })
    expect(buildMetricPair(spec({}), { keywords: ['a'] }, b, r)).toEqual({ baseline: 10, retest: 40 })
  })
  it('任一侧 null → null', () => {
    const b = run({ gscKeywords: [{ keyText: 'a', impressions: 10, position: 3 }] })
    expect(buildMetricPair(spec({}), { keywords: ['a'] }, b, run({}))).toBeNull()
  })
})

describe('buildProbeMetricRows', () => {
  it('两轮 probe → sov + presence 两行带符号 delta（D5：presence 取 unbranded 层）', () => {
    const b = run({ probe: probe({ sov: [{ name: 'you', pct: 12, you: true }], unbranded: { present: 2, total: 10, wilsonLow: 0.05 } }) })
    const r = run({ probe: probe({ sov: [{ name: 'you', pct: 18, you: true }], unbranded: { present: 5, total: 10, wilsonLow: 0.2 } }) })
    const rows = buildProbeMetricRows(b, r)
    const byName = Object.fromEntries(rows.map((x) => [x.metricName, x]))
    expect(byName['probe.brand_sov'].delta).toBe('+6')
    expect(byName['probe.brand_presence'].retestValue).toBe('50%')
    expect(byName['probe.brand_presence'].delta).toBe('+30')
  })
  it('presence 不再被全集口径（含 branded 题）拉高：unbranded 与 promptsPresent/promptsTotal 不一致时取 unbranded', () => {
    // 全集口径 promptsPresent/promptsTotal 若被用会算出 80%/90%（旧实现），但 unbranded 层只有 20%/50%。
    const b = run({ probe: probe({ promptsTotal: 10, promptsPresent: 8, unbranded: { present: 1, total: 5, wilsonLow: 0 } }) })
    const r = run({ probe: probe({ promptsTotal: 10, promptsPresent: 9, unbranded: { present: 2, total: 4, wilsonLow: 0 } }) })
    const rows = buildProbeMetricRows(b, r)
    const byName = Object.fromEntries(rows.map((x) => [x.metricName, x]))
    expect(byName['probe.brand_presence'].baselineValue).toBe('20%')
    expect(byName['probe.brand_presence'].retestValue).toBe('50%')
  })
  it('任一轮 probe 为 null → 空', () => {
    expect(buildProbeMetricRows(run({ probe: null }), run({ probe: probe({}) }))).toEqual([])
  })

  // —— 缺陷1：基线口径不可比守卫（migration 0008 + spec D4）——
  it('基线全 branded=false + 回测有 branded=true → 口径不可比，interpretation 含回填指引，delta 无涨跌措辞', () => {
    const b = run({
      brandedPromptCount: 0,
      probe: probe({ sov: [{ name: 'you', pct: 12, you: true }], unbranded: { present: 7, total: 30, wilsonLow: 0.1 } }),
    })
    const r = run({
      brandedPromptCount: 7,
      probe: probe({ sov: [{ name: 'you', pct: 0, you: true }], unbranded: { present: 0, total: 23, wilsonLow: 0 } }),
    })
    const rows = buildProbeMetricRows(b, r)
    const byName = Object.fromEntries(rows.map((x) => [x.metricName, x]))
    expect(byName['probe.brand_presence'].delta).toBe('—')
    expect(byName['probe.brand_presence'].interpretation).toContain('pnpm reparse-probes')
    expect(byName['probe.brand_presence'].interpretation).not.toMatch(/上升|下降/)
    expect(byName['probe.brand_sov'].delta).toBe('—')
    expect(byName['probe.brand_sov'].interpretation).toContain('pnpm reparse-probes')
  })

  it('两轮 ai_probe_results.parser_version 不一致 → 口径不可比（即使 branded 计数两轮都是 0）', () => {
    const b = run({
      brandedPromptCount: 0,
      parserVersions: ['v1'],
      probe: probe({ unbranded: { present: 7, total: 30, wilsonLow: 0.1 } }),
    })
    const r = run({
      brandedPromptCount: 0,
      parserVersions: ['v4'],
      probe: probe({ unbranded: { present: 0, total: 23, wilsonLow: 0 } }),
    })
    expect(checkUnbrandedComparability(b, r)).toEqual({ comparable: false })
    const rows = buildProbeMetricRows(b, r)
    const byName = Object.fromEntries(rows.map((x) => [x.metricName, x]))
    expect(byName['probe.brand_presence'].delta).toBe('—')
    expect(byName['probe.brand_presence'].interpretation).toBe(
      '基线数据未按当前口径分类（需运行 pnpm reparse-probes 回填后重测），本轮不给出变化结论',
    )
  })

  // —— 缺陷2：Wilson 噪声门（spec D4）——
  it('两轮 Wilson 95% 区间重叠（1/22 vs 2/22）→ "方向性波动，未超噪声"，不写上升/下降', () => {
    const b = run({ probe: probe({ unbranded: { present: 1, total: 22, wilsonLow: 0 } }) })
    const r = run({ probe: probe({ unbranded: { present: 2, total: 22, wilsonLow: 0 } }) })
    const rows = buildProbeMetricRows(b, r)
    const byName = Object.fromEntries(rows.map((x) => [x.metricName, x]))
    expect(byName['probe.brand_presence'].interpretation).toBe('方向性波动，未超噪声（推断，n=5 方向性）')
    expect(byName['probe.brand_presence'].interpretation).not.toMatch(/上升|下降/)
  })

  it('两轮 Wilson 95% 区间不重叠（0/22 vs 15/22）→ 允许"上升"措辞', () => {
    const b = run({ probe: probe({ unbranded: { present: 0, total: 22, wilsonLow: 0 } }) })
    const r = run({ probe: probe({ unbranded: { present: 15, total: 22, wilsonLow: 0 } }) })
    const rows = buildProbeMetricRows(b, r)
    const byName = Object.fromEntries(rows.map((x) => [x.metricName, x]))
    expect(byName['probe.brand_presence'].interpretation).toContain('上升')
  })
})

describe('checkUnbrandedComparability', () => {
  it('两轮口径一致（branded 计数、parserVersion 均一致）→ 可比', () => {
    expect(checkUnbrandedComparability(run({}), run({}))).toEqual({ comparable: true })
  })
  it('基线 branded=0、对比轮 branded>0 → 不可比', () => {
    expect(checkUnbrandedComparability(run({ brandedPromptCount: 0 }), run({ brandedPromptCount: 5 }))).toEqual({
      comparable: false,
    })
  })
  it('两轮都 branded>0（都已正确分类）→ 不触发信号 A', () => {
    expect(checkUnbrandedComparability(run({ brandedPromptCount: 3 }), run({ brandedPromptCount: 5 }))).toEqual({
      comparable: true,
    })
  })
  it('parserVersion 不一致 → 不可比', () => {
    expect(
      checkUnbrandedComparability(run({ parserVersions: ['v1'] }), run({ parserVersions: ['v4'] })),
    ).toEqual({ comparable: false })
  })
})
