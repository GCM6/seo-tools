import { describe, it, expect } from 'vitest'
import type { ValidationSpec } from './validation-spec'
import type { ProbeSummary } from '@/lib/probes/summary'
import {
  extractMetricTarget,
  extractRunMetric,
  buildMetricPair,
  buildProbeMetricRows,
  type RunMetrics,
} from './retest-metrics'

const spec = (o: Partial<ValidationSpec>): ValidationSpec => ({
  metricSource: 'gsc', metric: 'impressions', scope: 'site', direction: 'increase', windowDays: 28, ...o,
})
const probe = (o: Partial<ProbeSummary>): ProbeSummary => ({
  promptsTotal: 10, promptsPresent: 3, totalSamples: 50, perPrompt: [], sov: [], perEngine: [],
  sentiment: { positive: 0, neutral: 0, negative: 0, comparison: 0, total: 0 }, sampleEvidenceId: null, ...o,
})
const run = (o: Partial<RunMetrics>): RunMetrics => ({ probe: null, gscKeywords: [], ...o })

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
  it('probe/brand_presence 取比值', () => {
    const r = run({ probe: probe({ promptsTotal: 10, promptsPresent: 4 }) })
    expect(extractRunMetric(spec({ metricSource: 'probe', metric: 'brand_presence' }), r, null)).toBe(0.4)
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
  it('两轮 probe → sov + presence 两行带符号 delta', () => {
    const b = probe({ promptsTotal: 10, promptsPresent: 2, sov: [{ name: 'you', pct: 12, you: true }] })
    const r = probe({ promptsTotal: 10, promptsPresent: 5, sov: [{ name: 'you', pct: 18, you: true }] })
    const rows = buildProbeMetricRows(b, r)
    const byName = Object.fromEntries(rows.map((x) => [x.metricName, x]))
    expect(byName['probe.brand_sov'].delta).toBe('+6')
    expect(byName['probe.brand_presence'].retestValue).toBe('50%')
    expect(byName['probe.brand_presence'].delta).toBe('+30')
  })
  it('任一轮 null → 空', () => {
    expect(buildProbeMetricRows(null, probe({}))).toEqual([])
  })
})
