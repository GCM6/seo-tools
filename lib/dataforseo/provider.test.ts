import { describe, it, expect, vi } from 'vitest'
import { createDataforseoProvider } from './provider'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('createDataforseoProvider gating', () => {
  it('isConfigured() is false and every method throws when credentials missing', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status_code: 20000, tasks: [] }))
    const provider = createDataforseoProvider({ login: '', password: '', fetchImpl: fetchMock })

    expect(provider.isConfigured()).toBe(false)
    const opts = { locationCode: 1, languageCode: 'en' }
    await expect(provider.seedSerp(['x'], opts)).rejects.toThrow('dataforseo_not_configured')
    await expect(provider.bingIndex('x.com', opts)).rejects.toThrow('dataforseo_not_configured')
    await expect(provider.brandSerp('x', 'x.com', opts)).rejects.toThrow('dataforseo_not_configured')
    await expect(provider.keywordData(['x'], opts)).rejects.toThrow('dataforseo_not_configured')
    await expect(provider.backlinksSummary('x.com')).rejects.toThrow('dataforseo_not_configured')
    // 未配置时不得发起任何请求
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('isConfigured() is true and delegates when credentials present', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{ referring_domains: 1, backlinks: 2, rank: 3 }] }],
      }),
    )
    const provider = createDataforseoProvider({ login: 'u', password: 'p', fetchImpl: fetchMock })
    expect(provider.isConfigured()).toBe(true)
    const out = await provider.backlinksSummary('example.com')
    expect(out.referringDomains).toBe(1)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
