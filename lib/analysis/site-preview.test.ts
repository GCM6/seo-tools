import { describe, it, expect } from 'vitest'
import { previewSite } from './site-preview'
import { SsrfBlockedError } from '@/lib/security/ssrf-guard'

const okHtml = '<title>Remove PDF Metadata Online | MetaDocu</title><h1>Remove PDF Metadata Online</h1>'
const res = (status: number, body: string, ct = 'text/html; charset=utf-8') =>
  new Response(body, { status, headers: { 'content-type': ct } })
const deps = (r: () => Promise<Response>, ssrf?: Error) => ({
  assertPublicUrl: async (u: string) => {
    if (ssrf) throw ssrf
    return new URL(u)
  },
  safeFetch: async () => r(),
})

describe('previewSite（SP-A §3.2 向导站点预读）', () => {
  it('200 HTML → 事实 + 候选，error 为 null', async () => {
    const p = await previewSite('https://metadocu.com/', deps(async () => res(200, okHtml)))
    expect(p.error).toBeNull()
    expect(p.facts.title).toBe('Remove PDF Metadata Online | MetaDocu')
    expect(p.candidates).toEqual(['Remove PDF Metadata Online'])
  })

  it('缺 content-type 也按 HTML 解析（只拒绝明确的非 HTML 类型）', async () => {
    // 字符串 body 会被自动补 text/plain；用字节 body 才能真正模拟「响应不带 content-type」。
    const bare = new Response(new TextEncoder().encode(okHtml), { status: 200 })
    expect(bare.headers.get('content-type')).toBeNull()
    const p = await previewSite('https://metadocu.com/', deps(async () => bare))
    expect(p.error).toBeNull()
  })

  it.each([
    ['http_404', () => Promise.resolve(res(404, 'nope'))],
    ['http_503', () => Promise.resolve(res(503, 'down'))],
    ['not_html', () => Promise.resolve(res(200, '%PDF-1.4', 'application/pdf'))],
    ['fetch_failed', () => Promise.reject(new Error('timeout'))],
  ] as const)('%s → 空候选、不抛错', async (code, r) => {
    const p = await previewSite('https://x.test/', deps(r))
    expect(p).toMatchObject({ error: code, candidates: [] })
    expect(p.facts).toEqual({ title: null, h1: null, metaDescription: null, siteName: null })
  })

  it('SSRF 拦截 → blocked，不发请求', async () => {
    let fetched = false
    const p = await previewSite('https://127.0.0.1/', {
      assertPublicUrl: async () => { throw new SsrfBlockedError('private') },
      safeFetch: async () => { fetched = true; return res(200, okHtml) },
    })
    expect(p).toMatchObject({ error: 'blocked', candidates: [] })
    expect(fetched).toBe(false)
  })
})
