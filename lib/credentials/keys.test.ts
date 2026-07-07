import { describe, it, expect } from 'vitest'
import { CREDENTIAL_KEYS, isAllowedCredentialKey, credentialMeta, PROBE_CREDENTIAL_KEYS } from './keys'

describe('credential keys 允许清单', () => {
  it('含 4 家探针且标 testable', () => {
    for (const k of ['OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'])
      expect(credentialMeta(k)?.testable).toBe(true)
  })
  it('非探针源 testable=false', () => {
    expect(credentialMeta('GOOGLE_CSE_CX')?.testable).toBe(false)
  })
  it('未知键不在清单', () => {
    expect(isAllowedCredentialKey('HACK')).toBe(false)
    expect(isAllowedCredentialKey('OPENAI_API_KEY')).toBe(true)
  })
  it('PROBE_CREDENTIAL_KEYS 恰为 4 家探针 env 名', () => {
    expect(PROBE_CREDENTIAL_KEYS).toEqual(['OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'])
  })
  it('CREDENTIAL_KEYS 键唯一', () => {
    expect(new Set(CREDENTIAL_KEYS.map((c) => c.key)).size).toBe(CREDENTIAL_KEYS.length)
  })
})
