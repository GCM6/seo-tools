import { describe, it, expect } from 'vitest'
import { evaluateRulesWithLedger } from './check-ledger'
import { notChecked, type Rule, type RuleContext, type RuleHitDraft } from './types'
import type { SourceKey } from './sources'

const ctx = {} as RuleContext
const draft = (over: Partial<RuleHitDraft> = {}): RuleHitDraft => ({ title: 't', description: 'd', evidenceRefs: ['ev_1'], scope: 'site', ...over })
const rule = (id: string, evaluate: Rule['evaluate'], requiredSources: Rule['requiredSources'] = ['crawl'], version = 1): Rule => ({
  id, version, requiredSources, pillar: 'P1', side: 'technical', severity: 'warning', claimType: 'measured_hard', evaluate,
})
const avail = (...keys: SourceKey[]) => new Set<SourceKey>(['entry', ...keys])

describe('evaluateRulesWithLedger', () => {
  it('命中 → hit，带命中数与规则版本；命中被盖上 ruleId 与指纹', () => {
    const { hits, ledger } = evaluateRulesWithLedger(ctx, [rule('T02', () => [draft(), draft({ scope: 'x' })], ['crawl'], 3)], avail('crawl'))
    expect(ledger).toEqual([{ ruleId: 'T02', ruleVersion: 3, outcome: 'hit', reasonKind: null, reason: null, hitCount: 2 }])
    expect(hits.map((h) => h.ruleId)).toEqual(['T02', 'T02'])
    expect(hits[0].fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('返回空 → clear', () => {
    expect(evaluateRulesWithLedger(ctx, [rule('T03', () => null)], avail('crawl')).ledger[0]).toMatchObject({ outcome: 'clear', hitCount: 0 })
  })

  it('必需数据源不可用 → not_checked / data_gap，且不执行规则', () => {
    let called = false
    const { ledger } = evaluateRulesWithLedger(ctx, [rule('T15', () => { called = true; return draft() }, ['crawl', 'gsc'])], avail('crawl'))
    expect(called).toBe(false)
    expect(ledger[0]).toMatchObject({ outcome: 'not_checked', reasonKind: 'data_gap', reason: '缺数据源：gsc' })
  })

  it('任一组全部不可用 → 原因里列出整组', () => {
    const { ledger } = evaluateRulesWithLedger(ctx, [rule('IPF01', () => null, [['gsc', 'dataforseo:seed_serp']])], avail())
    expect(ledger[0].reason).toBe('缺数据源：gsc 或 dataforseo:seed_serp')
  })

  it('规则返回「未检查」哨兵 → not_checked，带规则给的类别与原因', () => {
    const { ledger, hits } = evaluateRulesWithLedger(ctx, [rule('AR01', () => notChecked('site_condition', '文章页少于 3 篇，无法评估'))], avail('crawl'))
    expect(hits).toEqual([])
    expect(ledger[0]).toMatchObject({ outcome: 'not_checked', reasonKind: 'site_condition', reason: '文章页少于 3 篇，无法评估' })
  })

  it('规则抛错 → error，不沉没其他规则（Review Focus 5）', () => {
    const { ledger, hits } = evaluateRulesWithLedger(
      ctx,
      [rule('T04', () => { throw new Error('boom') }), rule('T05', () => draft())],
      avail('crawl'),
    )
    expect(ledger[0]).toMatchObject({ ruleId: 'T04', outcome: 'error', reasonKind: 'error', reason: 'boom' })
    expect(ledger[1]).toMatchObject({ ruleId: 'T05', outcome: 'hit' })
    expect(hits).toHaveLength(1)
  })

  it('命中全部证据引用为空被丢弃 → error；部分为空 → hit，只算有效命中', () => {
    const allEmpty = evaluateRulesWithLedger(ctx, [rule('C04', () => [draft({ evidenceRefs: [] })])], avail('crawl'))
    expect(allEmpty.ledger[0]).toMatchObject({ outcome: 'error', reasonKind: 'error', reason: 'empty_evidence_refs' })
    expect(allEmpty.hits).toEqual([])
    const someEmpty = evaluateRulesWithLedger(ctx, [rule('C09', () => [draft({ evidenceRefs: [''] }), draft()])], avail('crawl'))
    expect(someEmpty.ledger[0]).toMatchObject({ outcome: 'hit', hitCount: 1 })
  })

  it('每条规则恰好一行台账，顺序与规则顺序一致', () => {
    const rules = [rule('A', () => null), rule('B', () => draft()), rule('C', () => null, ['gsc'])]
    expect(evaluateRulesWithLedger(ctx, rules, avail('crawl')).ledger.map((l) => l.ruleId)).toEqual(['A', 'B', 'C'])
  })
})
