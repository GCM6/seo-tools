import { describe, it, expect, vi } from 'vitest'
import { createCloudflareRenderProvider } from './cloudflare-provider'

describe('createCloudflareRenderProvider', () => {
  it('calls the CF content REST endpoint and returns rendered main text length', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc_123/browser-rendering/content')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer token_abc' })
      expect(JSON.parse(init?.body as string)).toEqual({ url: 'https://example.com' })
      return new Response(
        JSON.stringify({ success: true, result: '<html><body><p>Rendered text</p></body></html>' }),
        { status: 200 },
      )
    })
    const provider = createCloudflareRenderProvider({
      accountId: 'acc_123',
      apiToken: 'token_abc',
      fetchImpl: fetchImpl as never,
    })
    const result = await provider.renderMainText('https://example.com')
    expect(result.mainTextChars).toBe('Rendered text'.length)
    expect(result.html).toContain('Rendered text')
  })

  it('throws when the CF API responds with success: false', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'bad url' }] }), { status: 200 }))
    const provider = createCloudflareRenderProvider({ accountId: 'a', apiToken: 't', fetchImpl: fetchImpl as never })
    await expect(provider.renderMainText('https://example.com')).rejects.toThrow(/bad url/)
  })
})
