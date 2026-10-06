import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/analysis/site-preview', () => ({
  previewSite: vi.fn(async (url: string) => ({ facts: { title: url, h1: null, metaDescription: null, siteName: null }, candidates: [], error: null })),
}))

const { POST } = await import('./route')

const post = (body: unknown) => POST(new Request('http://localhost/api/site-preview', { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/site-preview', () => {
  it('域名缺失或非法 → 422 invalid_domain', async () => {
    for (const body of [{}, { domain: '' }, { domain: 'not a domain' }]) {
      const res = await post(body)
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({ error: 'invalid_domain' })
    }
  })

  it('裸域名规范化后交给 previewSite，原样返回其结果', async () => {
    const res = await post({ domain: 'metadocu.com' })
    expect(res.status).toBe(200)
    expect((await res.json()).facts.title).toBe('https://metadocu.com/')
  })
})
