import { describe, it, expect } from 'vitest'
import fixture from '@/lib/test-fixtures/metadocu-run-d12cceaf.json'
import { buildRuleContext } from './context'
import { evaluateRules } from './engine'
import { allRules } from './rules'
import { pillarsWithData } from './pillars-with-data'
import { aggregateProbeSummary, normalizeProjectDomain } from '@/lib/probes/summary'
import { brandFromDomain } from '@/lib/probes/prompt-set'
import type { DiagnosisEvidenceRow, RuleHit } from './types'

// 真实回放（SP-A Task 21）：10-03 metadocu 运行的证据（本地库只读导出，见夹具 _note）按 SP-A 口径重新求值。
// 夹具里同时存着旧代码当时产出的发现（fixture.findings），用来证明这些断言在改动前确实不成立。
const evidence = fixture.evidence as unknown as DiagnosisEvidenceRow[]
const answerByEvidence = new Map(
  evidence.filter((e) => e.type === 'ai_answer').map((e) => [e.id, (e.payload as { answerText?: string } | null)?.answerText]),
)
const probe = aggregateProbeSummary({
  prompts: fixture.prompts,
  results: fixture.probeResults.map((r) => ({ ...r, answerText: answerByEvidence.get(r.evidenceId) })),
  brand: brandFromDomain(fixture.project.domain),
  competitors: fixture.project.competitors,
  domain: normalizeProjectDomain(fixture.project.domain),
})
const ctx = buildRuleContext({
  project: {
    domain: fixture.project.domain,
    industry: fixture.project.industry,
    market: fixture.project.market,
    language: fixture.project.language,
    competitors: fixture.project.competitors,
  },
  evidence,
  probe,
  probeEvidenceId: probe?.sampleEvidenceId ?? null,
  robotsText: null,
})
const hits: RuleHit[] = evaluateRules(ctx, allRules)
const byRule = (id: string) => hits.filter((h) => h.ruleId === id)
const oldFinding = (id: string) => fixture.findings.find((f) => f.ruleId === id)

describe('metadocu 10-03 运行按 SP-A 口径回放', () => {
  it('不再出现"富摘要无法生成"的说法（旧 C05c 有）', () => {
    expect(oldFinding('C05c')?.description).toContain('无法生成')
    expect(hits.filter((h) => h.description.includes('无法生成'))).toEqual([])
  })

  it('C05c 拆成两条：工具页的 SoftwareApplication 缺评分/评论 → 不符合要求；博客 Article 缺推荐字段 → 推荐提示', () => {
    const required = byRule('C05c').find((h) => h.scope === 'schema:required')
    const examples = (required?.detail?.examples ?? []) as { url: string; type: string; missing: string[] }[]
    expect(examples.some((e) => e.type === 'SoftwareApplication')).toBe(true)
    const recommended = byRule('C05c').find((h) => h.scope === 'schema:recommended')
    expect(recommended?.severity).toBe('notice')
    expect(((recommended?.detail?.examples ?? []) as { type: string }[]).some((e) => e.type === 'Article')).toBe(true)
  })

  it('没有 hreflang 的站不出 T14', () => {
    expect(byRule('T14')).toEqual([])
  })

  it('P3 没有 GSC / Labs 证据，不计入健康分（旧口径因一条 P3 发现把它算进去）', () => {
    expect(oldFinding('K05')?.pillar).toBe('P3')
    expect(pillarsWithData(evidence, 0)).not.toContain('P3')
  })

  it('G05 写实际采样 n=1（这轮 DeepSeek 每条问题只采 1 次），旧描述写的是 n=5', () => {
    expect(oldFinding('G05')?.description).toContain('n=5')
    const g05 = byRule('G05')
    expect(g05).toHaveLength(1)
    expect(g05[0].description).toContain('n=1')
    expect(g05[0].description).not.toContain('n=5')
  })

  it('G07 不再出现：旧证据里 Reddit 的 0 条是 403 被记成的 0，回放时标为无法核实', () => {
    expect(oldFinding('G07')).toBeTruthy()
    expect(byRule('G07')).toEqual([])
  })
})
