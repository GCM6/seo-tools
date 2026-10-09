import { describe, it, expect } from 'vitest'
import { assertCanGeneratePrompt, assertFindingClaimEvidence, assertInputFactsVerified, assertIssueIncluded } from '@/lib/repositories/validators'

describe('§6.2 invariants', () => {
  it('non accepted/edited recommendation cannot generate prompt', () => {
    expect(() => assertCanGeneratePrompt('draft')).toThrow()
    expect(() => assertCanGeneratePrompt('rejected')).toThrow()
    expect(() => assertCanGeneratePrompt('accepted')).not.toThrow()
    expect(() => assertCanGeneratePrompt('edited')).not.toThrow()
  })
  it('measured_hard finding requires an L4 evidence', () => {
    expect(() => assertFindingClaimEvidence({ claimType: 'measured_hard', evidenceLevels: ['L2', 'L3'] })).toThrow()
    expect(() => assertFindingClaimEvidence({ claimType: 'measured_hard', evidenceLevels: ['L4'] })).not.toThrow()
  })
  it('measured_sample finding requires a sampled (L3/L4) evidence', () => {
    expect(() => assertFindingClaimEvidence({ claimType: 'measured_sample', evidenceLevels: ['L1'] })).toThrow()
    expect(() => assertFindingClaimEvidence({ claimType: 'measured_sample', evidenceLevels: ['L3'] })).not.toThrow()
  })
  it('generated prompt input facts must all be verified', () => {
    expect(() => assertInputFactsVerified([{ status: 'verified' }, { status: 'draft' }])).toThrow()
    expect(() => assertInputFactsVerified([{ status: 'verified' }])).not.toThrow()
  })
})

import { isValidCategory, assertValidCategory, isValidKeyword } from '@/lib/repositories/validators'

describe('品类/关键词校验（SP-A §3.2）', () => {
  it('接受英文品类描述', () => {
    for (const ok of ['document metadata removal tool', 'B2B SaaS', "Men's running shoes", 'CRM & sales automation', 'e-mail (IMAP/SMTP) client'])
      expect(isValidCategory(ok), ok).toBe(true)
  })
  it('拒绝旧下拉默认值、中文、过短、过长、纯空白', () => {
    for (const bad of ['B2B SaaS · 项目协作', 'B2B SaaS · Team collaboration', '其他…', 'Other…', '文档工具', 'ab', '   ', 'x'.repeat(81), '-leading dash'])
      expect(isValidCategory(bad), bad).toBe(false)
    expect(() => assertValidCategory('其他…')).toThrow()
    expect(() => assertValidCategory('document metadata removal tool')).not.toThrow()
  })
  it('关键词允许 2 字符、拒绝中文', () => {
    expect(isValidKeyword('ai')).toBe(true)
    expect(isValidKeyword('remove pdf metadata')).toBe(true)
    expect(isValidKeyword('a')).toBe(false)
    expect(isValidKeyword('移除元数据')).toBe(false)
  })
})

describe('assertIssueIncluded', () => {
  it('只有已纳入的问题能生成执行提示词', () => {
    expect(() => assertIssueIncluded('included')).not.toThrow()
    for (const d of ['pending', 'deferred', 'false_positive']) expect(() => assertIssueIncluded(d)).toThrow()
  })
})
