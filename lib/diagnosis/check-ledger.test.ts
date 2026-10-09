import { describe, it, expect } from 'vitest'
import fixture from '@/lib/test-fixtures/metadocu-run-d12cceaf.json'
import { evaluateRulesWithLedger } from './check-ledger'
import { buildRuleContext } from './context'
import { evaluateRules } from './engine'
import { allRules } from './rules'
import { availableSources } from './sources'
import { notChecked, type DiagnosisEvidenceRow, type Rule, type RuleContext, type RuleHitDraft } from './types'
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

// 读抓取数据的规则（入口页之外还读 site_audit / 深检页 schema）必须声明依赖 crawl：抓取没采到时它们只看到了入口页，
// 台账若仍记「查过」，没被看到的页面上的问题会被判「没了」（终审 F2）。夹具是 10-03 metadocu 真实运行的证据（只读导出）。
describe('读抓取数据的规则：抓取不可用 → 没查（真实 metadocu 证据）', () => {
  const CRAWL_READERS = ['T01', 'C05a', 'C05b', 'C05c', 'C06', 'C07', 'E01', 'IPF01', 'IPF02', 'IPF03']
  const rules = allRules.filter((r) => CRAWL_READERS.includes(r.id))
  const evidence = fixture.evidence as unknown as DiagnosisEvidenceRow[]
  const ctxOf = (rows: DiagnosisEvidenceRow[]) =>
    buildRuleContext({
      project: {
        domain: fixture.project.domain,
        industry: fixture.project.industry,
        market: fixture.project.market,
        language: fixture.project.language,
        competitors: fixture.project.competitors,
      },
      evidence: rows,
      probe: null,
      probeEvidenceId: null,
      robotsText: null,
    })
  // 其余数据源都可用，只有 crawl 的状态在变（IPF 组还需要 gsc 或种子词 SERP）。
  const sourcesWithCrawl = (status: string, capturedEvidenceCount: number) =>
    availableSources(
      [
        { sourceKey: 'crawl', status, capturedEvidenceCount },
        { sourceKey: 'gsc', status: 'collected', capturedEvidenceCount: 2 },
        { sourceKey: 'dataforseo:seed_serp', status: 'collected', capturedEvidenceCount: 1 },
      ],
      { confirmedCompetitorCount: 0 },
    )

  it('名单里的规则都存在', () => {
    expect(rules.map((r) => r.id).sort()).toEqual([...CRAWL_READERS].sort())
  })

  it.each([
    ['not_attempted', 0], // 项目关闭了抓取
    ['failed', 0],
    ['partial', 0], // partial 但一页没采到也不算可用
  ])('抓取状态 %s → 这些规则记 not_checked / data_gap（原因写缺 crawl），不执行、不出命中', (status, count) => {
    // 抓取没跑时不会有 site_audit、sitemap 与深检页（带 sitePageId）的证据，只剩入口页那几条。
    const entryOnly = evidence.filter((e) => e.type !== 'site_audit' && e.type !== 'sitemap' && !e.sitePageId)
    const { ledger, hits } = evaluateRulesWithLedger(ctxOf(entryOnly), rules, sourcesWithCrawl(status, count))
    expect(ledger.map((l) => [l.ruleId, l.outcome, l.reasonKind, l.reason])).toEqual(
      rules.map((r) => [r.id, 'not_checked', 'data_gap', '缺数据源：crawl']),
    )
    expect(hits).toEqual([])
  })

  it('抓取已采到 → 照常求值：台账只有查出 / 没查出，命中与直接跑规则完全相同', () => {
    const ctx = ctxOf(evidence)
    const { ledger, hits } = evaluateRulesWithLedger(ctx, rules, sourcesWithCrawl('collected', 21))
    expect(ledger.every((l) => l.outcome === 'hit' || l.outcome === 'clear')).toBe(true)
    expect(hits).toEqual(evaluateRules(ctx, rules))
    // 深检页的结构化数据确实进了判定：C05c 的缺字段实例里有深检页（不是入口页）的 URL。
    const deepUrls = new Set(evidence.filter((e) => e.type === 'schema' && e.sitePageId).map((e) => e.source))
    const c05c = hits.filter((h) => h.ruleId === 'C05c').flatMap((h) => ((h.detail?.examples ?? []) as { url: string }[]).map((e) => e.url))
    expect(c05c.some((u) => deepUrls.has(u))).toBe(true)
  })
})
