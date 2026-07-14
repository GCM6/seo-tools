import { describe, expect, it, vi } from 'vitest'
import { createBrowserlessRenderProvider } from './browserless-provider'

describe('createBrowserlessRenderProvider', () => {
  it('requests the rendered DOM from Browserless Content API', async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe('https://renderer.example/chromium/content?token=token_abc')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(init?.body as string)).toEqual({ url: 'https://example.com/' })
      return new Response('<html><body><p>Client-rendered content</p></body></html>', { status: 200 })
    })
    const provider = createBrowserlessRenderProvider({
      apiToken: 'token_abc',
      contentUrl: 'https://renderer.example/chromium/content',
      fetchImpl: fetchImpl as never,
    })

    await expect(provider.renderMainText('https://example.com/')).resolves.toMatchObject({
      mainTextChars: 'Client-rendered content'.length,
    })
  })

  it('surfaces a failed browser-renderer response', async () => {
    const provider = createBrowserlessRenderProvider({
      apiToken: 'bad',
      fetchImpl: (async () => new Response('Unauthorized', { status: 401 })) as never,
    })
    await expect(provider.renderMainText('https://example.com/')).rejects.toThrow(/401 Unauthorized/)
  })
})
