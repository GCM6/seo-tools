import { describe, it, expect } from 'vitest'
import { aggregateProbeSummary, type ProbeSummaryInput } from './summary'
import { classifyBrandedAnswer, type BrandedAnswerState } from './engine-capability'

// Wave 3 子任务 2（spec docs/superpowers/specs/2026-07-13-geo-branded-unbranded-redesign.md）：
// 跨层一致性——聚合层 aggregateProbeSummary 的 branded.perEngine 五态计数，必须与展示层
// classifyBrandedAnswer 对同一批原始结果逐条分类后求和完全相等。两层判定逻辑虽已统一收口到
// lib/probes/engine-capability.ts（子任务 1），但调用处仍是两份独立代码（聚合循环 vs 逐条展示），
// 本测试防止未来任一处的调用方式（字段透传、过滤条件）悄悄产生分歧。
describe('branded 五态计数：聚合层 vs 展示层逐条分类一致性', () => {
  const prompts = [
    { id: 'p1', text: '品牌 A 是什么？', priority: 0, branded: true },
    { id: 'p2', text: '品牌 A 和竞品对比？', priority: 1, branded: true },
    { id: 'p3', text: '推荐工具？', priority: 2, branded: false },
    { id: 'p4', text: '有哪些替代品？', priority: 3, branded: false },
  ]

  // 四个 provider：openai/perplexity/gemini 为静态能力表登记的联网（检索型）引擎，
  // deepseek 为记忆型（结构上无引用能力，citedUrls 恒空）。
  type R = ProbeSummaryInput['results'][number]
  const results: R[] = []
  let seq = 0
  const push = (over: Partial<R> & { promptId: string; provider: string }) => {
    seq += 1
    results.push({
      brandPresent: true,
      competitorsMentioned: [],
      evidenceId: `ev_${seq}`,
      ...over,
    })
  }

  for (const provider of ['openai', 'perplexity', 'gemini']) {
    // 联网引擎：branded 提示下四态全覆盖
    push({ promptId: 'p1', provider, citedUrls: ['https://example.com/a'] }) // 有引用 → grounded
    push({ promptId: 'p2', provider, citedUrls: [], hedged: true }) // 无引用 + hedged → speculative
    push({ promptId: 'p1', provider, citedUrls: [], unknownAdmission: true }) // 无引用 + 承认不知道 → unknown
    push({ promptId: 'p2', provider, citedUrls: [] }) // 无引用、无 hedge、无承认 → unverified
    // unbranded 提示：不应计入 branded.perEngine（无论 brandPresent/citedUrls 取值）
    push({ promptId: 'p3', provider, citedUrls: ['https://example.com/b'] })
  }
  // deepseek：记忆型引擎，citedUrls 结构上恒空，只有 speculative/unknown/undetermined 三态
  push({ promptId: 'p1', provider: 'deepseek', citedUrls: [], hedged: true }) // speculative
  push({ promptId: 'p2', provider: 'deepseek', citedUrls: [], unknownAdmission: true }) // unknown
  push({ promptId: 'p1', provider: 'deepseek', citedUrls: [] }) // undetermined
  push({ promptId: 'p2', provider: 'deepseek', citedUrls: ['https://example.com/c'] }) // 即使带 citedUrls 也不算 grounded → undetermined
  push({ promptId: 'p4', provider: 'deepseek', citedUrls: [] }) // unbranded，排除

  const brandedPromptIds = new Set(prompts.filter((p) => p.branded).map((p) => p.id))

  it('两层五态计数完全一致（四 provider、branded/unbranded 混合、citedUrls/hedged/unknownAdmission 全组合）', () => {
    const summary = aggregateProbeSummary({ prompts, results, brand: 'BrandA', competitors: [] })!

    // 展示层口径：只对 branded 提示的结果逐条 classifyBrandedAnswer 求和
    // （与聚合层 branded.perEngine 同一限定子集——D3 规定 branded.perEngine 只统计 branded 问题）。
    const expected = new Map<string, Record<BrandedAnswerState, number>>()
    for (const r of results) {
      if (!brandedPromptIds.has(r.promptId)) continue
      const provider = r.provider ?? 'unknown'
      const bucket =
        expected.get(provider) ?? { grounded: 0, speculative: 0, unknown: 0, unverified: 0, undetermined: 0 }
      const state = classifyBrandedAnswer({
        provider: r.provider,
        webSearchEnabled: r.webSearchEnabled,
        citedUrls: r.citedUrls,
        hedged: r.hedged,
        unknownAdmission: r.unknownAdmission,
      })
      bucket[state] += 1
      expected.set(provider, bucket)
    }

    expect(summary.branded.perEngine.length).toBe(expected.size)
    for (const engineBreakdown of summary.branded.perEngine) {
      const exp = expected.get(engineBreakdown.provider)!
      expect({
        grounded: engineBreakdown.grounded,
        speculative: engineBreakdown.speculative,
        unknown: engineBreakdown.unknown,
        unverified: engineBreakdown.unverified,
        undetermined: engineBreakdown.undetermined,
      }).toEqual(exp)
    }
  })
})
