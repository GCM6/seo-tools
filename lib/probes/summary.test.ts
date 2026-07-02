import { describe, it, expect } from 'vitest'
import { aggregateProbeSummary } from './summary'

const prompts = [
  { id: 'p1', text: '推荐工具？', priority: 0 },
  { id: 'p2', text: '替代品？', priority: 1 },
  { id: 'p3', text: '靠谱吗？', priority: 2 },
]

function result(promptId: string, over: Partial<{ brandPresent: boolean; competitorsMentioned: string[]; evidenceId: string }> = {}) {
  return {
    promptId,
    brandPresent: over.brandPresent ?? false,
    competitorsMentioned: over.competitorsMentioned ?? [],
    evidenceId: over.evidenceId ?? 'ev_x',
  }
}

describe('aggregateProbeSummary', () => {
  it('returns null when there are no probe results（无数据不出 0/20 假实测）', () => {
    expect(aggregateProbeSummary({ prompts, results: [], brand: 'metadocu', competitors: [] })).toBeNull()
  })

  it('marks a prompt present when ANY sample of it mentions the brand', () => {
    const s = aggregateProbeSummary({
      prompts,
      results: [
        result('p1', { brandPresent: true, evidenceId: 'ev_hit' }),
        result('p1'),
        result('p2'),
        result('p3'),
      ],
      brand: 'metadocu',
      competitors: [],
    })!
    expect(s.promptsTotal).toBe(3)
    expect(s.promptsPresent).toBe(1)
    expect(s.perPrompt.map((p) => p.present)).toEqual([true, false, false])
    expect(s.perPrompt[0].text).toBe('推荐工具？')
    // 代表性证据取第一条命中的（点开能看到品牌确实出现的原文）
    expect(s.sampleEvidenceId).toBe('ev_hit')
  })

  it('computes share of voice per brand/competitor over all samples', () => {
    const s = aggregateProbeSummary({
      prompts,
      results: [
        result('p1', { brandPresent: true, competitorsMentioned: ['Notion'] }),
        result('p2', { competitorsMentioned: ['Notion', 'Confluence'] }),
        result('p3'),
        result('p3', { competitorsMentioned: ['Notion'] }),
      ],
      brand: 'metadocu',
      competitors: ['Notion', 'Confluence'],
    })!
    expect(s.totalSamples).toBe(4)
    // Notion 3/4=75%，metadocu 1/4=25%，Confluence 1/4=25%；降序，you 标记在品牌行
    expect(s.sov).toEqual([
      { name: 'Notion', pct: 75, you: false },
      { name: 'metadocu', pct: 25, you: true },
      { name: 'Confluence', pct: 25, you: false },
    ])
  })

  it('keeps prompt order by priority and falls back sampleEvidenceId to the first result', () => {
    const s = aggregateProbeSummary({
      prompts: [prompts[2], prompts[0], prompts[1]],
      results: [result('p1', { evidenceId: 'ev_first' })],
      brand: 'metadocu',
      competitors: [],
    })!
    expect(s.perPrompt.map((p) => p.text)).toEqual(['推荐工具？', '替代品？', '靠谱吗？'])
    expect(s.sampleEvidenceId).toBe('ev_first')
  })
})
