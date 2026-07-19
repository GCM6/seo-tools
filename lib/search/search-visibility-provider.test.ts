import { describe, expect, it, vi } from 'vitest'
import { createGoogleCseSearchVisibilityProvider } from './search-visibility-provider'

describe('createGoogleCseSearchVisibilityProvider', () => {
  it('is disabled when credentials are missing', () => {
    const provider = createGoogleCseSearchVisibilityProvider({ apiKey: '', cx: '' })
    expect(provider.isConfigured()).toBe(false)
  })

  it('queries Google Custom Search with site:domain and parses visibility signals', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.origin + url.pathname).toBe('https://www.googleapis.com/customsearch/v1')
      expect(url.searchParams.get('q')).toBe('site:example.com')
      expect(url.searchParams.get('num')).toBe('10')
      return new Response(
        JSON.stringify({
          searchInformation: { totalResults: '12' },
          items: [
            { title: 'Home', link: 'https://example.com/', snippet: 'Example home' },
            { title: 'Docs', link: 'https://example.com/docs', snippet: 'Docs page' },
          ],
        }),
      )
    })
    const provider = createGoogleCseSearchVisibilityProvider({
      apiKey: 'key',
      cx: 'cx',
      fetchImpl: fetchImpl as never,
    })

    const result = await provider.checkSite('example.com')

    expect(result).toMatchObject({
      provider: 'google_custom_search',
      query: 'site:example.com',
      domain: 'example.com',
      totalResults: 12,
      resultCount: 2,
      homePagePresent: true,
      firstResultUrl: 'https://example.com/',
    })
  })

  it('search() 用任意查询串复用同一 CSE 通道，不带 domain 语义', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.searchParams.get('q')).toBe('site:youtube.com "Acme"')
      return new Response(
        JSON.stringify({
          searchInformation: { totalResults: '3' },
          items: [{ title: 'Acme channel', link: 'https://youtube.com/acme', snippet: 's' }],
        }),
      )
    })
    const provider = createGoogleCseSearchVisibilityProvider({ apiKey: 'key', cx: 'cx', fetchImpl: fetchImpl as never })

    const result = await provider.search('site:youtube.com "Acme"')

    expect(result).toEqual({
      query: 'site:youtube.com "Acme"',
      totalResults: 3,
      resultCount: 1,
      results: [{ title: 'Acme channel', link: 'https://youtube.com/acme', snippet: 's' }],
      checkedAt: expect.any(String),
    })
  })

  it('search() 未配置时抛出', async () => {
    const provider = createGoogleCseSearchVisibilityProvider({ apiKey: '', cx: '' })
    await expect(provider.search('anything')).rejects.toThrow('google_custom_search_not_configured')
  })
})
