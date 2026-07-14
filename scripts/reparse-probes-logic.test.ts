import { describe, it, expect } from 'vitest'
import {
  extractFromRaw,
  resolveAnswerAndCitedUrls,
  reparseProbeRow,
  reparsePromptRow,
  buildProbeUpdatePayload,
  summarizeProbeDiffs,
  summarizePromptDiffs,
  type ProbeRowExisting,
} from './reparse-probes-logic'
import { PROBE_PARSER_VERSION } from '@/lib/probes/parse'

const baseExisting: ProbeRowExisting = {
  brandPresent: false,
  targetDomainCited: false,
  competitorsMentioned: [],
  sentiment: 'neutral',
  hedged: false,
  unknownAdmission: false,
  parserVersion: 'v3',
}

describe('extractFromRaw', () => {
  it('extracts OpenAI url_citation annotations', () => {
    const raw = {
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Metadocu is great.',
              annotations: [{ type: 'url_citation', url: 'https://metadocu.com/about' }],
            },
          ],
        },
      ],
    }
    const r = extractFromRaw('openai', raw)
    expect(r.answerText).toBe('Metadocu is great.')
    expect(r.citedUrls).toEqual(['https://metadocu.com/about'])
  })

  it('extracts Perplexity citations + search_results', () => {
    const raw = {
      choices: [{ message: { content: 'answer text' } }],
      citations: ['https://a.example.com'],
      search_results: [{ url: 'https://b.example.com' }],
    }
    const r = extractFromRaw('perplexity', raw)
    expect(r.answerText).toBe('answer text')
    expect(r.citedUrls).toEqual(['https://a.example.com', 'https://b.example.com'])
  })

  it('extracts Gemini groundingChunks', () => {
    const raw = {
      candidates: [
        {
          content: { parts: [{ text: 'gemini answer' }] },
          groundingMetadata: { groundingChunks: [{ web: { uri: 'https://c.example.com' } }] },
        },
      ],
    }
    const r = extractFromRaw('gemini', raw)
    expect(r.answerText).toBe('gemini answer')
    expect(r.citedUrls).toEqual(['https://c.example.com'])
  })

  it('DeepSeek raw responses always yield empty citedUrls (no web search capability)', () => {
    const raw = { choices: [{ message: { content: 'deepseek answer' } }] }
    const r = extractFromRaw('deepseek', raw)
    expect(r.answerText).toBe('deepseek answer')
    expect(r.citedUrls).toEqual([])
  })
})

describe('resolveAnswerAndCitedUrls', () => {
  it('uses payload as-is when both answerText and citedUrls are present', () => {
    const r = resolveAnswerAndCitedUrls(
      'openai',
      { answerText: 'from payload', citedUrls: ['https://x.com'] },
      JSON.stringify({ output: [] }),
    )
    expect(r).toEqual({ answerText: 'from payload', citedUrls: ['https://x.com'] })
  })

  it('falls back to rawText extraction when payload lacks citedUrls', () => {
    const raw = { choices: [{ message: { content: 'deepseek answer' } }] }
    const r = resolveAnswerAndCitedUrls('deepseek', { answerText: 'deepseek answer' }, JSON.stringify(raw))
    expect(r).toEqual({ answerText: 'deepseek answer', citedUrls: [] })
  })

  it('falls back fully to rawText when payload is null', () => {
    const raw = { choices: [{ message: { content: 'from raw' } }], citations: ['https://cited.example.com'] }
    const r = resolveAnswerAndCitedUrls('perplexity', null, JSON.stringify(raw))
    expect(r).toEqual({ answerText: 'from raw', citedUrls: ['https://cited.example.com'] })
  })
})

describe('reparseProbeRow', () => {
  it('flips brandPresent when the historical parser missed a hit that v4 now catches via alias', () => {
    const input = {
      id: 'apr_1',
      provider: 'deepseek',
      brand: 'metadocu',
      domain: 'metadocu.com',
      competitors: [],
      aliases: ['MetaDoc'],
      payload: { answerText: 'MetaDoc is a documentation tool.', citedUrls: [] },
      rawText: JSON.stringify({ choices: [{ message: { content: 'MetaDoc is a documentation tool.' } }] }),
      existing: baseExisting,
    }
    const diff = reparseProbeRow(input)
    expect(diff.parsed.brandPresent).toBe(true)
    expect(diff.brandPresentChanged).toBe(true)
    expect(diff.anyChanged).toBe(true)
  })

  it('does not flip brandPresent when result is unchanged (still a diff due to parserVersion bump only)', () => {
    const input = {
      id: 'apr_2',
      provider: 'deepseek',
      brand: 'metadocu',
      domain: 'metadocu.com',
      competitors: [],
      aliases: [],
      payload: { answerText: 'metadocu is a documentation tool.', citedUrls: [] },
      rawText: JSON.stringify({ choices: [{ message: { content: 'metadocu is a documentation tool.' } }] }),
      existing: { ...baseExisting, brandPresent: true, parserVersion: PROBE_PARSER_VERSION },
    }
    const diff = reparseProbeRow(input)
    expect(diff.brandPresentChanged).toBe(false)
    expect(diff.parserVersionChanged).toBe(false)
    expect(diff.anyChanged).toBe(false)
  })

  it('DeepSeek rows with no citations never derive targetDomainCited=true (no web search capability)', () => {
    const input = {
      id: 'apr_3',
      provider: 'deepseek',
      brand: 'metadocu',
      domain: 'metadocu.com',
      competitors: [],
      aliases: [],
      payload: { answerText: 'metadocu likely does documentation.', citedUrls: [] },
      rawText: JSON.stringify({ choices: [{ message: { content: 'metadocu likely does documentation.' } }] }),
      existing: baseExisting,
    }
    const diff = reparseProbeRow(input)
    expect(diff.parsed.targetDomainCited).toBe(false)
    expect(diff.parsed.hedged).toBe(true)
    expect(diff.parserVersionChanged).toBe(true)
  })

  it('detects hedged/unknownAdmission newly on v4 re-parse (existing v3 row had no such columns semantics)', () => {
    const input = {
      id: 'apr_4',
      provider: 'deepseek',
      brand: 'metadocu',
      domain: 'metadocu.com',
      competitors: [],
      aliases: [],
      payload: { answerText: "I'm not aware of a product called metadocu.", citedUrls: [] },
      rawText: JSON.stringify({ choices: [{ message: { content: "I'm not aware of a product called metadocu." } }] }),
      existing: baseExisting,
    }
    const diff = reparseProbeRow(input)
    expect(diff.parsed.unknownAdmission).toBe(true)
    expect(diff.unknownAdmissionChanged).toBe(true)
  })
})

describe('D8 白名单：competitors 编辑不应污染回填写库/差异统计', () => {
  it('project.competitors 在 baseline 后被编辑，重算出的 competitorsMentioned 与历史基线不同，但 anyChanged 不因此翻转（未命中白名单四列）', () => {
    const input = {
      id: 'apr_5',
      provider: 'deepseek' as const,
      brand: 'metadocu',
      domain: 'metadocu.com',
      // 用户在 baseline 之后新增的竞品——今天的上下文，不该用来覆写历史基线。
      competitors: ['NewRival'],
      aliases: [],
      payload: { answerText: 'metadocu is compared against NewRival in this space.', citedUrls: [] },
      rawText: JSON.stringify({
        choices: [{ message: { content: 'metadocu is compared against NewRival in this space.' } }],
      }),
      // 历史基线是探针期冻结的竞品集算出的，不含 NewRival；brandPresent=true 且
      // parserVersion 已是 v4，隔离掉其余三个白名单变化源，只让 competitorsMentioned 产生差异。
      existing: { ...baseExisting, brandPresent: true, competitorsMentioned: [], parserVersion: PROBE_PARSER_VERSION },
    }

    const diff = reparseProbeRow(input)

    // 重算结果确实包含 competitorsMentioned 差异（证明 bug 场景被真实构造出来，不是空对照）。
    expect(diff.parsed.competitorsMentioned).toEqual(['NewRival'])

    // 但 D8 白名单只看 brandPresent/hedged/unknownAdmission/parserVersion，
    // 这四者均未变化，anyChanged 必须是 false —— dry-run 报告不应把这行算作「差异」。
    expect(diff.brandPresentChanged).toBe(false)
    expect(diff.parserVersionChanged).toBe(false)
    expect(diff.anyChanged).toBe(false)

    // 写库 payload 必须收窄到白名单四列，不含 competitorsMentioned/targetDomainCited/sentiment。
    const payload = buildProbeUpdatePayload(diff)
    expect(payload).toEqual({
      brandPresent: diff.parsed.brandPresent,
      hedged: diff.parsed.hedged,
      unknownAdmission: diff.parsed.unknownAdmission,
      parserVersion: PROBE_PARSER_VERSION,
    })
    expect(Object.keys(payload).sort()).toEqual(['brandPresent', 'hedged', 'parserVersion', 'unknownAdmission'])
    expect(payload).not.toHaveProperty('competitorsMentioned')
    expect(payload).not.toHaveProperty('targetDomainCited')
    expect(payload).not.toHaveProperty('sentiment')
  })
})

describe('reparsePromptRow', () => {
  it('flips branded=true when brand appears in the prompt text', () => {
    const diff = reparsePromptRow({ id: 'pr_1', text: 'Is metadocu reliable?', brand: 'metadocu', aliases: [], existingBranded: false })
    expect(diff.branded).toBe(true)
    expect(diff.changed).toBe(true)
  })

  it('stays branded=false for a pure category prompt', () => {
    const diff = reparsePromptRow({
      id: 'pr_2',
      text: 'What are the best products or services for B2B SaaS?',
      brand: 'metadocu',
      aliases: [],
      existingBranded: false,
    })
    expect(diff.branded).toBe(false)
    expect(diff.changed).toBe(false)
  })

  it('flips branded=true via alias match even when the canonical brand word is absent', () => {
    const diff = reparsePromptRow({
      id: 'pr_3',
      text: 'How does MetaDoc compare to Notion?',
      brand: 'metadocu',
      aliases: ['MetaDoc'],
      existingBranded: false,
    })
    expect(diff.branded).toBe(true)
    expect(diff.changed).toBe(true)
  })
})

describe('summarizeProbeDiffs', () => {
  it('aggregates totals and per-provider breakdown', () => {
    const diffs = [
      reparseProbeRow({
        id: 'a',
        provider: 'deepseek',
        brand: 'metadocu',
        domain: 'metadocu.com',
        competitors: [],
        aliases: [],
        payload: { answerText: 'metadocu likely does docs.', citedUrls: [] },
        rawText: '{}',
        existing: baseExisting,
      }),
      reparseProbeRow({
        id: 'b',
        provider: 'openai',
        brand: 'metadocu',
        domain: 'metadocu.com',
        competitors: [],
        aliases: [],
        payload: { answerText: "I'm not aware of metadocu.", citedUrls: [] },
        rawText: '{}',
        existing: { ...baseExisting, parserVersion: PROBE_PARSER_VERSION },
      }),
    ]
    const summary = summarizeProbeDiffs(diffs)
    expect(summary.totalRows).toBe(2)
    expect(summary.hedgedTrue).toBe(1)
    expect(summary.unknownAdmissionTrue).toBe(1)
    expect(summary.byProvider.deepseek.total).toBe(1)
    expect(summary.byProvider.openai.total).toBe(1)
  })
})

describe('summarizePromptDiffs', () => {
  it('counts changed rows and branded=true rows', () => {
    const diffs = [
      reparsePromptRow({ id: '1', text: 'metadocu pricing?', brand: 'metadocu', aliases: [], existingBranded: false }),
      reparsePromptRow({ id: '2', text: 'best B2B SaaS tools?', brand: 'metadocu', aliases: [], existingBranded: false }),
    ]
    const summary = summarizePromptDiffs(diffs)
    expect(summary.totalRows).toBe(2)
    expect(summary.changedRows).toBe(1)
    expect(summary.brandedTrue).toBe(1)
  })
})
