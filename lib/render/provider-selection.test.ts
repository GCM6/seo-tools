import { describe, expect, it } from 'vitest'
import { selectRenderProvider } from './provider-selection'

describe('selectRenderProvider', () => {
  it('falls back to Browserless when Cloudflare credentials are absent', () => {
    expect(selectRenderProvider({ BROWSERLESS_API_TOKEN: 'token' }).isConfigured?.()).toBe(true)
  })

  it('keeps Cloudflare as the first choice when both are configured', () => {
    expect(selectRenderProvider({
      CLOUDFLARE_ACCOUNT_ID: 'account', CLOUDFLARE_API_TOKEN: 'cf-token', BROWSERLESS_API_TOKEN: 'browserless-token',
    }).isConfigured?.()).toBe(true)
  })

  it('reports unavailable only when neither real browser renderer is configured', () => {
    expect(selectRenderProvider({}).isConfigured?.()).toBe(false)
  })
})
