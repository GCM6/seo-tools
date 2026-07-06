import { describe, it, expect } from 'vitest'
import { evaluateRules, fingerprint } from './engine'
import type { Rule, RuleContext } from './types'

function ctx(): RuleContext {
  return {
    project: { domain: 'example.com', industry: '', market: 'us', language: 'en', competitors: [] },
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
  }
}

const ruleFixture = (over: Partial<Rule> & Pick<Rule, 'id' | 'evaluate'>): Rule => ({
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  ...over,
})

describe('evaluateRules', () => {
  it('stamps rule metadata + fingerprint onto hits', () => {
    const rule = ruleFixture({
      id: 'T99',
      evaluate: () => ({ title: 't', description: 'd', evidenceRefs: ['ev_1'], scope: 'site' }),
    })
    const [hit] = evaluateRules(ctx(), [rule])
    expect(hit.ruleId).toBe('T99')
    expect(hit.pillar).toBe('P1')
    expect(hit.severity).toBe('warning')
    expect(hit.claimType).toBe('measured_hard')
    expect(hit.fingerprint).toBe(fingerprint('T99', 'site'))
  })

  it('drops hits with empty evidenceRefs (evidence-first invariant)', () => {
    const rule = ruleFixture({
      id: 'T98',
      evaluate: () => ({ title: 't', description: 'd', evidenceRefs: [], scope: 'site' }),
    })
    expect(evaluateRules(ctx(), [rule])).toHaveLength(0)
  })

  it('swallows a throwing rule without sinking the rest', () => {
    const boom = ruleFixture({ id: 'BOOM', evaluate: () => { throw new Error('x') } })
    const ok = ruleFixture({
      id: 'OK',
      evaluate: () => ({ title: 't', description: 'd', evidenceRefs: ['ev_1'], scope: 'site' }),
    })
    const hits = evaluateRules(ctx(), [boom, ok])
    expect(hits.map((h) => h.ruleId)).toEqual(['OK'])
  })

  it('supports multi-hit rules and per-hit severity/claim override', () => {
    const rule = ruleFixture({
      id: 'MULTI',
      evaluate: () => [
        { title: 'a', description: '', evidenceRefs: ['ev_a'], scope: 'tpl:/a' },
        { title: 'b', description: '', evidenceRefs: ['ev_b'], scope: 'tpl:/b', severity: 'error', claimType: 'inferred' },
      ],
    })
    const hits = evaluateRules(ctx(), [rule])
    expect(hits).toHaveLength(2)
    expect(hits[1].severity).toBe('error')
    expect(hits[1].claimType).toBe('inferred')
    expect(hits[0].fingerprint).not.toBe(hits[1].fingerprint)
  })
})
