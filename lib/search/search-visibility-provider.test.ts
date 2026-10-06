import { describe, expect, it, vi } from 'vitest'
import { createGoogleCseSearchVisibilityProvider } from './search-visibility-provider'
import { reasonOf } from '@/lib/collection/result'
import { CSE_403_NO_KEY_BODY } from '@/lib/test-fixtures/real-shapes'

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
      // SP-A §4.3：原文随结果返回，由采集段存档。
      raw: expect.objectContaining({ status: 200 }),
    })
  })

  it('search() 真实 403（无 key）→ 抛出的错误带 http_403 原因与原文', async () => {
    const fetchImpl = vi.fn(async () => new Response(CSE_403_NO_KEY_BODY, { status: 403, headers: { 'content-type': 'application/json; charset=UTF-8' } }))
    const provider = createGoogleCseSearchVisibilityProvider({ apiKey: 'key', cx: 'cx', fetchImpl: fetchImpl as never })
    const err = await provider.search('site:youtube.com "metadocu"').catch((e: unknown) => e)
    expect(reasonOf(err)).toBe('http_403')
    expect((err as { raw?: { status: number; body: string } }).raw).toMatchObject({ status: 403 })
    expect((err as { raw: { body: string } }).raw.body).toContain('unregistered callers')
  })

  it('search() 200 但不是 JSON → 抛出的错误原因为 invalid_json，带原文', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>blocked</html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    const provider = createGoogleCseSearchVisibilityProvider({ apiKey: 'key', cx: 'cx', fetchImpl: fetchImpl as never })
    const err = await provider.search('anything').catch((e: unknown) => e)
    expect(reasonOf(err)).toBe('invalid_json')
    expect((err as { raw?: { status: number } }).raw?.status).toBe(200)
  })

  it('search() 200 + 错误信封 {"error":{"code":429}} → 抛错 api_429（最终审查 F1-1）', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"code":429,"message":"rate"}}', { status: 200, headers: { 'content-type': 'application/json' } }))
    const provider = createGoogleCseSearchVisibilityProvider({ apiKey: 'key', cx: 'cx', fetchImpl: fetchImpl as never })
    expect(reasonOf(await provider.search('anything').catch((e: unknown) => e))).toBe('api_429')
  })

  it('search() 200 但缺 searchInformation（{} 或只有 kind）→ 抛错 invalid_shape，不当成 0 条结果', async () => {
    for (const body of ['{}', '{"kind":"customsearch#search"}']) {
      const fetchImpl = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }))
      const provider = createGoogleCseSearchVisibilityProvider({ apiKey: 'key', cx: 'cx', fetchImpl: fetchImpl as never })
      expect(reasonOf(await provider.search('anything').catch((e: unknown) => e)), body).toBe('invalid_shape')
    }
  })

  it('search() 合法的零结果（有 searchInformation、没有 items）→ 0 条', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"kind":"customsearch#search","searchInformation":{"totalResults":"0"}}', { status: 200, headers: { 'content-type': 'application/json' } }))
    const provider = createGoogleCseSearchVisibilityProvider({ apiKey: 'key', cx: 'cx', fetchImpl: fetchImpl as never })
    expect(await provider.search('anything')).toMatchObject({ resultCount: 0, totalResults: 0 })
  })

  it('search() 未配置时抛出', async () => {
    const provider = createGoogleCseSearchVisibilityProvider({ apiKey: '', cx: '' })
    await expect(provider.search('anything')).rejects.toThrow('google_custom_search_not_configured')
  })
})
