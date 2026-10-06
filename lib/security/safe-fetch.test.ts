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

describe('safeFetch 跳转循环与 Cookie（2026-10-03 真实站点冒烟：jac.com.cn /error.html 自跳转）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('同一 URL 在 Cookie 不变时再次出现 → 立即判为循环（不等到 maxRedirects），信息仍含 too many redirects', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://example.com/error.html' } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://example.com/error.html' } }))
    await expect(safeFetch('https://example.com/a', { maxRedirects: 10 })).rejects.toThrow(/too many redirects \(redirect loop\)/)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('跳转时下发的 Cookie 在后续同主机跳转中带上（浏览器同样会带）：Cookie 门控的自跳转不算循环', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://example.com/a', 'set-cookie': 'gate=1; Path=/' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const res = await safeFetch('https://example.com/a', { headers: { 'user-agent': 'UA' } })
    expect(res.status).toBe(200)
    const second = new Headers(vi.mocked(fetch).mock.calls[1][1]!.headers)
    expect([second.get('cookie'), second.get('user-agent')]).toEqual(['gate=1', 'UA'])
  })

  it('Cookie 只发给下发它的主机', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://other.example/x', 'set-cookie': 'sid=abc' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    await safeFetch('https://example.com/a')
    expect(new Headers(vi.mocked(fetch).mock.calls[1][1]!.headers).get('cookie')).toBeNull()
  })
})
