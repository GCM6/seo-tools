import { describe, it, expect } from 'vitest'
import { parseProbeAnswer, PROBE_PARSER_VERSION } from './parse'

const base = {
  brand: 'metadocu',
  domain: 'metadocu.com',
  competitors: ['Notion', 'Confluence'],
}

describe('parseProbeAnswer', () => {
  it('detects brand presence with word boundaries (latin, case-insensitive)', () => {
    const r = parseProbeAnswer({ ...base, answerText: 'I recommend Metadocu for docs.', citedUrls: [] })
    expect(r.brandPresent).toBe(true)
  })

  it('does not match the brand inside another word', () => {
    const r = parseProbeAnswer({ ...base, answerText: 'try metadocumentation tools', citedUrls: [] })
    expect(r.brandPresent).toBe(false)
  })

  it('counts a domain mention in the text as brand presence', () => {
    const r = parseProbeAnswer({ ...base, answerText: 'see metadocu.com for details', citedUrls: [] })
    expect(r.brandPresent).toBe(true)
  })

  it('matches CJK brand names by substring', () => {
    const r = parseProbeAnswer({
      brand: '飞书',
      domain: 'feishu.cn',
      competitors: [],
      answerText: '推荐使用飞书文档协作。',
      citedUrls: [],
    })
    expect(r.brandPresent).toBe(true)
  })

  it('flags targetDomainCited when a citation URL is on the target domain (incl. subdomain)', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'no brand mention',
      citedUrls: ['https://docs.metadocu.com/guide', 'https://other.com/'],
    })
    expect(r.targetDomainCited).toBe(true)
    expect(r.brandPresent).toBe(false)
    expect(r.citedUrls).toEqual(['https://docs.metadocu.com/guide', 'https://other.com/'])
  })

  it('does not flag targetDomainCited for lookalike domains', () => {
    const r = parseProbeAnswer({ ...base, answerText: '', citedUrls: ['https://notmetadocu.com/'] })
    expect(r.targetDomainCited).toBe(false)
  })

  it('lists mentioned competitors, preserving configured casing', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Popular picks are notion and Confluence.',
      citedUrls: [],
    })
    expect(r.competitorsMentioned).toEqual(['Notion', 'Confluence'])
  })

  it('exposes a parser version for protocol provenance', () => {
    expect(PROBE_PARSER_VERSION).toBe('v2')
  })

  it('classifies a positive brand mention as positive', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu is a reliable and recommended docs tool.',
      citedUrls: [],
    })
    expect(r.brandPresent).toBe(true)
    expect(r.sentiment).toBe('positive')
  })

  it('classifies a comparison mention as comparison (highest priority)', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu is a great alternative compared to Notion.',
      citedUrls: [],
    })
    expect(r.sentiment).toBe('comparison')
  })

  it('classifies a negative brand mention as negative', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu feels outdated and lacks key features.',
      citedUrls: [],
    })
    expect(r.sentiment).toBe('negative')
  })

  it('classifies a neutral brand mention as neutral', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu is a documentation product.',
      citedUrls: [],
    })
    expect(r.sentiment).toBe('neutral')
  })

  it('treats a negated positive word as non-positive', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'Metadocu is not recommended for large teams.',
      citedUrls: [],
    })
    expect(r.sentiment).toBe('neutral')
  })

  it('defaults sentiment to neutral when the brand is absent', () => {
    const r = parseProbeAnswer({
      ...base,
      answerText: 'The best docs tools are excellent and recommended.',
      citedUrls: [],
    })
    expect(r.brandPresent).toBe(false)
    expect(r.sentiment).toBe('neutral')
  })

  it('classifies a CJK positive brand mention as positive', () => {
    const r = parseProbeAnswer({
      brand: '飞书',
      domain: 'feishu.cn',
      competitors: [],
      answerText: '飞书是一款非常靠谱、值得推荐的协作工具。',
      citedUrls: [],
    })
    expect(r.sentiment).toBe('positive')
  })
})
