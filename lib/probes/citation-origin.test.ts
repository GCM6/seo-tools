import { describe, it, expect } from 'vitest'
import { classifyCitationOrigin } from './citation-origin'

describe('classifyCitationOrigin', () => {
  it('classifies an exact-match host as owned', () => {
    expect(classifyCitationOrigin('https://metadocu.com/guide', 'metadocu.com')).toBe('owned')
  })

  it('classifies a subdomain of the target as owned', () => {
    expect(classifyCitationOrigin('https://docs.metadocu.com/guide', 'metadocu.com')).toBe('owned')
  })

  it('classifies www.-prefixed target/url pairs as owned (normalized)', () => {
    expect(classifyCitationOrigin('https://www.metadocu.com/', 'metadocu.com')).toBe('owned')
  })

  it('classifies an unrelated domain as third_party', () => {
    expect(classifyCitationOrigin('https://notion.so/page', 'metadocu.com')).toBe('third_party')
  })

  it('classifies a lookalike domain as third_party (no false-positive substring match)', () => {
    expect(classifyCitationOrigin('https://notmetadocu.com/', 'metadocu.com')).toBe('third_party')
  })

  it('classifies an unparseable URL as third_party (conservative — no evidence, no owned claim)', () => {
    expect(classifyCitationOrigin('not a url', 'metadocu.com')).toBe('third_party')
  })
})
