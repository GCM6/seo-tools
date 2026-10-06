import { describe, it, expect } from 'vitest'
import { buildFindingRows, buildRecommendationRows } from './finding-rows'
import { generateRecommendation } from './recommend'
import type { RuleHit } from './types'

const hit: RuleHit = {
  ruleId: 'C05a',
  pillar: 'P3',
  side: 'technical',
  severity: 'error',
  claimType: 'inferred',
  fingerprint: 'abc',
  scope: 'https://example.com/',
  title: 'JSON-LD 缺失',
  description: '',
  evidenceRefs: ['ev_1'],
}

describe('buildFindingRows', () => {
  it('把 hit.ruleId 写进 FindingRow.ruleId', () => {
    const [row] = buildFindingRows('run_1', [hit])
    expect(row.ruleId).toBe('C05a')
    expect(row.runId).toBe('run_1')
    expect(row.fingerprint).toBe('abc')
  })
})

const mkHit = (o: Partial<RuleHit>): RuleHit => ({
  ruleId: 'K01', pillar: 'P3', side: 'seo', severity: 'warning', claimType: 'inferred',
  title: 't', description: 'd', evidenceRefs: ['ev1'], scope: 'keywords:opportunity', fingerprint: 'fp1', ...o,
})

describe('buildFindingRows metricTarget', () => {
  it('K 组 detail.keywords → metricTarget.keywords', () => {
    const rows = buildFindingRows('run1', [mkHit({ detail: { keywords: [{ text: 'widget' }, { text: 'gadget' }] } })])
    expect(rows[0].metricTarget).toEqual({ keywords: ['widget', 'gadget'] })
  })
  it('无关键词 detail → metricTarget null', () => {
    const rows = buildFindingRows('run1', [mkHit({ detail: { url: 'https://x' } })])
    expect(rows[0].metricTarget).toBeNull()
  })
})

describe('buildRecommendationRows（SP-A §5.3：只记录型规则不出建议）', () => {
  it('生成器返回 null 的命中不出建议行，其余行的 findingId 与命中一一对齐', async () => {
    const hits = [mkHit({ ruleId: 'C01', side: 'seo', fingerprint: 'a' }), mkHit({ ruleId: 'G08', side: 'geo', pillar: 'P5', fingerprint: 'b' }), mkHit({ ruleId: 'C02', side: 'seo', fingerprint: 'c' })]
    const findingRows = buildFindingRows('run1', hits)
    const rows = await buildRecommendationRows('run1', hits, findingRows, generateRecommendation, 'example.com')
    expect(rows.map((r) => r.findingId)).toEqual([findingRows[0].id, findingRows[2].id])
  })
})
