import { describe, it, expect, vi } from 'vitest'
import { parseLightCheckHtml, fetchLightCheck } from './light-check'

const html = `<html><head><title> 产品列表 </title>
<link rel="canonical" href="https://example.com/products">
<meta name="robots" content="noindex"></head>
<body><a href="/products/1?utm_source=x">a</a><a href="/products/1">dup</a>
<a href="https://blog.example.com/x">跨子域</a><a href="mailto:a@b.c">mail</a>
<p>hello world</p></body></html>`

describe('parseLightCheckHtml', () => {
  it('提取 title/canonical/metaRobots，内链归一化去重且只留同站', () => {
    const out = parseLightCheckHtml(html, 'https://example.com/products', 'example.com')
    expect(out.title).toBe('产品列表')
    expect(out.canonicalUrl).toBe('https://example.com/products')
    expect(out.metaRobots).toBe('noindex')
    expect(out.internalLinks).toEqual(['https://example.com/products/1'])
    expect(out.mainTextChars).toBeGreaterThan(0)
  })
})

describe('fetchLightCheck', () => {
  it('200 HTML 页返回完整轻检结果', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      status: 200, url, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }), text: async () => html,
    })) as never
    const out = await fetchLightCheck('https://example.com/products', 'example.com', fetchImpl)
    expect(out.checkStatus).toBe('checked')
    expect(out.httpStatus).toBe(200)
    expect(out.contentHash).toHaveLength(64)
  })

  it('404 与非 HTML 不解析正文，仍记状态', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      status: 404, url, headers: new Headers({ 'content-type': 'text/html' }), text: async () => 'nf',
    })) as never
    const out = await fetchLightCheck('https://example.com/gone', 'example.com', fetchImpl)
    expect(out).toMatchObject({ checkStatus: 'checked', httpStatus: 404, internalLinks: [] })
  })

  it('fetch 抛错收敛为 error，不向外抛', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('timeout') }) as never
    const out = await fetchLightCheck('https://example.com/x', 'example.com', fetchImpl)
    expect(out).toMatchObject({ checkStatus: 'error', errorReason: 'timeout', httpStatus: 0 })
  })
})
