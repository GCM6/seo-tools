import { describe, it, expect } from 'vitest'
import { classifyProbeSentiment } from './sentiment'

describe('classifyProbeSentiment', () => {
  it('returns neutral when the brand is absent from the text', () => {
    expect(classifyProbeSentiment('Notion and Confluence are great docs tools.', 'Metadocu')).toBe('neutral')
  })

  it('returns neutral for empty inputs', () => {
    expect(classifyProbeSentiment('', 'Metadocu')).toBe('neutral')
    expect(classifyProbeSentiment('Metadocu is great.', '')).toBe('neutral')
  })

  it('classifies a positive brand sentence as positive', () => {
    expect(classifyProbeSentiment('Metadocu is a reliable and recommended tool.', 'Metadocu')).toBe('positive')
  })

  it('classifies a negative brand sentence as negative', () => {
    expect(classifyProbeSentiment('Metadocu feels outdated and lacks features.', 'Metadocu')).toBe('negative')
  })

  it('classifies a comparison sentence as comparison (highest priority)', () => {
    expect(classifyProbeSentiment('Metadocu is the best alternative to Notion.', 'Metadocu')).toBe('comparison')
  })

  it('prioritises comparison over positive/negative within the same brand sentence', () => {
    expect(classifyProbeSentiment('Metadocu is excellent compared to Notion.', 'Metadocu')).toBe('comparison')
  })

  it('prioritises negative over positive across brand sentences', () => {
    const text = 'Metadocu is recommended by many. However Metadocu lacks integrations.'
    expect(classifyProbeSentiment(text, 'Metadocu')).toBe('negative')
  })

  it('treats a negated positive word as non-positive (neutral)', () => {
    expect(classifyProbeSentiment('Metadocu is not recommended for large teams.', 'Metadocu')).toBe('neutral')
  })

  it('classifies a neutral factual brand sentence as neutral', () => {
    expect(classifyProbeSentiment('Metadocu is a documentation product.', 'Metadocu')).toBe('neutral')
  })

  it('only inspects brand sentences, ignoring sentiment about other products', () => {
    const text = 'Notion is excellent and highly recommended. Metadocu is a docs product.'
    expect(classifyProbeSentiment(text, 'Metadocu')).toBe('neutral')
  })

  it('matches latin brand by word boundary, not substring', () => {
    // "metadocumentation" must not count as a Metadocu sentence
    expect(classifyProbeSentiment('metadocumentation tools are recommended.', 'Metadocu')).toBe('neutral')
  })

  it('classifies CJK brand sentences by substring (positive)', () => {
    expect(classifyProbeSentiment('飞书是一款靠谱、值得推荐的协作工具。', '飞书')).toBe('positive')
  })

  it('classifies CJK comparison as comparison', () => {
    expect(classifyProbeSentiment('飞书相比钉钉在文档协作上更强。', '飞书')).toBe('comparison')
  })

  it('classifies CJK negative as negative', () => {
    expect(classifyProbeSentiment('飞书的移动端体验很差，缺乏部分核心功能。', '飞书')).toBe('negative')
  })

  it('is deterministic for the same input', () => {
    const text = 'Metadocu is reliable and recommended.'
    expect(classifyProbeSentiment(text, 'Metadocu')).toBe(classifyProbeSentiment(text, 'Metadocu'))
  })

  // v5 回归（缺陷 1）：aliases 参数缺省不传时行为不变（旧调用方兼容）。
  it('defaults to no aliases when the param is omitted (backward compatible)', () => {
    expect(classifyProbeSentiment('MetaDoc is outdated and lacks features.', 'Metadocu')).toBe('neutral')
  })

  // v5 新增（D7）：品牌未在句中出现，但别名命中，情感应按别名句判定，不再恒 neutral。
  it('classifies sentiment via an alias sentence when the primary brand token is absent', () => {
    expect(classifyProbeSentiment('MetaDoc is outdated and lacks features.', 'Metadocu', ['MetaDoc'])).toBe('negative')
  })

  it('classifies a positive alias sentence as positive', () => {
    expect(classifyProbeSentiment('MetaDoc is reliable and recommended.', 'Metadocu', ['MetaDoc'])).toBe('positive')
  })
})
