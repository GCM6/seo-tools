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
    expect(PROBE_PARSER_VERSION).toBe('v1')
  })
})
