import { describe, it, expect } from 'vitest'
import { dataSourceStatus } from './data-sources'

describe('dataSourceStatus', () => {
  it('reports everything unconfigured for an empty env', () => {
    expect(dataSourceStatus({})).toEqual({
      searchProvider: false,
      renderProvider: false,
      renderStaticFallback: true,
      aiProviders: [],
      gsc: false,
    })
  })

  it('requires BOTH cse key and cx for the search provider', () => {
    expect(dataSourceStatus({ GOOGLE_CSE_API_KEY: 'k' }).searchProvider).toBe(false)
    expect(dataSourceStatus({ GOOGLE_CSE_API_KEY: 'k', GOOGLE_CSE_CX: 'c' }).searchProvider).toBe(true)
  })

  it('requires both cloudflare account id and token for the render provider', () => {
    expect(dataSourceStatus({ CLOUDFLARE_ACCOUNT_ID: 'a' }).renderProvider).toBe(false)
    expect(dataSourceStatus({ CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_API_TOKEN: 't' }).renderProvider).toBe(true)
    expect(dataSourceStatus({}).renderStaticFallback).toBe(true)
    expect(dataSourceStatus({ BROWSERLESS_API_TOKEN: 'token' }).renderProvider).toBe(true)
  })

  it('lists exactly the AI providers whose keys are set', () => {
    expect(dataSourceStatus({ OPENAI_API_KEY: 'x', GEMINI_API_KEY: 'y' }).aiProviders).toEqual(['openai', 'gemini'])
    expect(dataSourceStatus({ DEEPSEEK_API_KEY: 'z' }).aiProviders).toEqual(['deepseek'])
  })
})
