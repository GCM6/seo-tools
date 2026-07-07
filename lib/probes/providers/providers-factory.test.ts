import { describe, it, expect } from 'vitest'
import { buildProbeProviders } from './index'

describe('buildProbeProviders(creds)', () => {
  it('creds 有 openai key → 仅 openai isConfigured', () => {
    const ps = buildProbeProviders({ OPENAI_API_KEY: 'sk' })
    expect(ps.find((p) => p.id === 'openai')!.isConfigured()).toBe(true)
    expect(ps.find((p) => p.id === 'gemini')!.isConfigured()).toBe(false)
  })
  it('空 creds → 全部未配置', () => {
    expect(buildProbeProviders({}).every((p) => !p.isConfigured())).toBe(true)
  })
})
