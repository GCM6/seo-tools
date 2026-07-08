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

  it('SP-A2 #6：带 answerText 时对当前竞品集重解析（解冻探针期确认竞品）', () => {
    // 'Rival' 不在任何冻结的 competitorsMentioned（模拟探针后才确认的竞品），但原文提到 → 重解析命中
    const s = aggregateProbeSummary({
      prompts,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e1', provider: 'openai', answerText: '可以试试 Rival 这个工具' },
        { promptId: 'p2', brandPresent: false, competitorsMentioned: [], evidenceId: 'e2', provider: 'openai', answerText: '暂无推荐' },
      ],
      brand: 'metadocu',
      competitors: ['Rival'],
    })!
    expect(s.sov.find((x) => x.name === 'Rival')!.pct).toBe(50) // 2 样本 1 命中
  })

  it('SP-A2 #6：无 answerText 回退冻结 competitorsMentioned（不回归旧调用方）', () => {
    const s = aggregateProbeSummary({
      prompts,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: ['Rival'], evidenceId: 'e1' },
        { promptId: 'p2', brandPresent: false, competitorsMentioned: [], evidenceId: 'e2' },
      ],
      brand: 'metadocu',
      competitors: ['Rival'],
    })!
    expect(s.sov.find((x) => x.name === 'Rival')!.pct).toBe(50)
  })

  it('SP-A2 #6：分引擎 SoV 各引擎独立计（引擎不可互推）', () => {
    const s = aggregateProbeSummary({
      prompts,
      results: [
        { promptId: 'p1', brandPresent: true, competitorsMentioned: ['Notion'], evidenceId: 'e1', provider: 'openai' },
        { promptId: 'p2', brandPresent: false, competitorsMentioned: ['Notion'], evidenceId: 'e2', provider: 'openai' },
        { promptId: 'p1', brandPresent: true, competitorsMentioned: [], evidenceId: 'e3', provider: 'perplexity' },
      ],
      brand: 'metadocu',
      competitors: ['Notion'],
    })!
    const openai = s.sovByEngine!.find((e) => e.engine === 'openai')!
    expect(openai.samples).toBe(2)
    expect(openai.sov.find((x) => x.name === 'Notion')!.pct).toBe(100) // openai 2/2
    const px = s.sovByEngine!.find((e) => e.engine === 'perplexity')!
    expect(px.samples).toBe(1)
    expect(px.sov.find((x) => x.name === 'Notion')!.pct).toBe(0) // perplexity 0/1
    expect(s.sovByEngine!.map((e) => e.engine)).toEqual(['openai', 'perplexity']) // samples 降序
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
