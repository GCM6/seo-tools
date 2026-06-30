import { describe, it, expect } from 'vitest'
import { assertCanGeneratePrompt, assertFindingClaimEvidence, assertInputFactsVerified } from '@/lib/repositories/validators'

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
