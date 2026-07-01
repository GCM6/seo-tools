import { describe, it, expect, vi, beforeEach } from 'vitest'
import { safeFetch } from './safe-fetch'

vi.mock('./ssrf-guard', () => ({
  assertPublicUrl: vi.fn(async (u: string) => new URL(u)),
  SsrfBlockedError: class extends Error {},
}))

describe('safeFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('validates the URL before fetching', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('ok', { status: 200 }))
    const res = await safeFetch('https://example.com')
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledWith('https://example.com/', expect.objectContaining({ redirect: 'manual' }))
  })

  it('re-validates each redirect hop and follows up to maxRedirects', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://example.com/next' } }))
      .mockResolvedValueOnce(new Response('final', { status: 200 }))
    const res = await safeFetch('https://example.com/start')
    expect(await res.text()).toBe('final')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws after exceeding maxRedirects', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://example.com/loop' } }),
    )
    await expect(safeFetch('https://example.com/start', { maxRedirects: 2 })).rejects.toThrow(/too many redirects/i)
  })
})
