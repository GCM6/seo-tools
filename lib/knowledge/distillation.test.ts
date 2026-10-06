import { describe, expect, it } from 'vitest'
import { __test } from './distillation'

describe('distillation evidence gate', () => {
  it('requires an exact source quote and caps community confidence', () => {
    const result = __test.parseAndValidate({ claims: [{
      claimType: 'hypothesis', topic: 'crawl', statementZh: '一个观点', statementEn: 'A claim',
      exactQuote: 'robots.txt does not prevent indexing', applicability: {}, confidence: 'measured',
      consensusKey: 'robots_indexing', officialConflict: false,
    }] }, 'A user said robots.txt does not prevent indexing in this case.', 'reddit_community')
    expect(result.claims[0].confidence).toBe('hypothesis')
    expect(() => __test.parseAndValidate({ claims: [{
      claimType: 'hypothesis', topic: 'crawl', statementZh: 'x', statementEn: 'x', exactQuote: 'invented',
      applicability: {}, confidence: 'hypothesis', officialConflict: false,
    }] }, 'source', 'reddit_community')).toThrow('distillation_quote_invalid')
  })
})

