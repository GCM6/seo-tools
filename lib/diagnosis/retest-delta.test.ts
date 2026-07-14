import { describe, it, expect } from 'vitest'
import {
  computeFindingDelta,
  summarizeFindingDelta,
  computeOutcome,
  buildRetestSnapshotRows,
  type FindingRef,
} from './retest-delta'
import type { ValidationSpec } from './validation-spec'

const ref = (fp: string, sev: FindingRef['severity'], title = fp): FindingRef => ({ fingerprint: fp, severity: sev, title })

describe('computeFindingDelta', () => {
  it('classifies resolved / persistent / new / regressed by fingerprint', () => {
    const baseline = [ref('a', 'high'), ref('b', 'mid'), ref('c', 'ok')]
    const retest = [ref('b', 'mid'), ref('c', 'high'), ref('d', 'mid')]
    const deltas = computeFindingDelta(baseline, retest)

    const byFp = Object.fromEntries(deltas.map((d) => [d.fingerprint, d.state]))
    expect(byFp.a).toBe('resolved') // 只在 baseline
    expect(byFp.b).toBe('persistent') // 两轮同严重度
    expect(byFp.c).toBe('regressed') // ok → high 变严重
    expect(byFp.d).toBe('new') // 只在 retest
  })

  it('persistent when severity improves or unchanged', () => {
    const deltas = computeFindingDelta([ref('x', 'high')], [ref('x', 'mid')])
    expect(deltas[0].state).toBe('persistent') // 变轻仍算未消除
  })

  it('summarizes counts', () => {
    const deltas = computeFindingDelta([ref('a', 'high'), ref('b', 'mid')], [ref('b', 'mid'), ref('c', 'ok')])
    expect(summarizeFindingDelta(deltas)).toEqual({ resolved: 1, persistent: 1, new: 1, regressed: 0 })
  })
})

const spec = (direction: ValidationSpec['direction']): ValidationSpec => ({
  metricSource: 'gsc',
  metric: 'impressions',
  scope: 'site',
  direction,
  windowDays: 28,
})

describe('computeOutcome', () => {
  it('uses metric pair when available (increase direction)', () => {
    expect(computeOutcome(spec('increase'), { baseline: 100, retest: 150 }, null)).toBe('effective')
    expect(computeOutcome(spec('increase'), { baseline: 150, retest: 100 }, null)).toBe('regressed')
    expect(computeOutcome(spec('increase'), { baseline: 100, retest: 100 }, null)).toBe('ineffective')
  })

  it('respects decrease direction (e.g. position/affected pages)', () => {
    expect(computeOutcome(spec('decrease'), { baseline: 10, retest: 4 }, null)).toBe('effective')
    expect(computeOutcome(spec('decrease'), { baseline: 4, retest: 10 }, null)).toBe('regressed')
  })

  it('falls back to finding state when no metric', () => {
    expect(computeOutcome(spec('increase'), null, 'resolved')).toBe('effective')
    expect(computeOutcome(spec('increase'), null, 'regressed')).toBe('regressed')
    expect(computeOutcome(spec('increase'), null, 'persistent')).toBe('ineffective')
    expect(computeOutcome(spec('increase'), null, 'new')).toBe('unknown')
    expect(computeOutcome(null, null, null)).toBe('unknown')
  })

  // —— 缺陷1 守卫延伸（retest-metrics.ts checkUnbrandedComparability 接线）——
  const probeSpec = (direction: ValidationSpec['direction']): ValidationSpec => ({
    metricSource: 'probe', metric: 'brand_presence', scope: 'site', direction, windowDays: 28,
  })

  it('probe 口径 + comparable=false → 短路为 unknown，即使标量看起来明显改善', () => {
    expect(computeOutcome(probeSpec('increase'), { baseline: 2, retest: 5 }, null, false)).toBe('unknown')
    // 无标量、只有 finding 四态 resolved 时同样短路（不让 resolved 悄悄冒充 effective）
    expect(computeOutcome(probeSpec('increase'), null, 'resolved', false)).toBe('unknown')
  })

  it('probe 口径 + comparable=true（默认）→ 行为不回归，按标量正常判定', () => {
    expect(computeOutcome(probeSpec('increase'), { baseline: 2, retest: 5 }, null)).toBe('effective')
    expect(computeOutcome(probeSpec('increase'), { baseline: 2, retest: 5 }, null, true)).toBe('effective')
  })

  it('非 probe 口径（gsc）即使 comparable=false 也不受影响——守卫只管 probe 口径', () => {
    expect(computeOutcome(spec('increase'), { baseline: 100, retest: 150 }, null, false)).toBe('effective')
  })
})

describe('buildRetestSnapshotRows', () => {
  it('emits finding four-state rows and optional health delta', () => {
    const rows = buildRetestSnapshotRows({ resolved: 4, persistent: 3, new: 1, regressed: 0 }, { baseline: 62, retest: 71 })
    const byMetric = Object.fromEntries(rows.map((r) => [r.metricName, r]))
    expect(byMetric['findings.resolved'].delta).toBe('+4')
    expect(byMetric['findings.new'].delta).toBe('+1')
    expect(byMetric['health.overall'].delta).toBe('+9')
    expect(byMetric['health.overall'].interpretation).toContain('推断')
  })

  it('omits health row when scores missing', () => {
    const rows = buildRetestSnapshotRows({ resolved: 0, persistent: 0, new: 0, regressed: 0 })
    expect(rows.some((r) => r.metricName === 'health.overall')).toBe(false)
  })
})
