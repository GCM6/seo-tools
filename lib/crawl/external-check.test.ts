import { describe, it, expect, vi } from 'vitest'
import { selectExternalTargets, checkExternalLinks, EXTERNAL_CHECK_CAP } from './external-check'
import { SsrfBlockedError } from '@/lib/security/ssrf-guard'
import type { LinkGraphExternal } from './link-graph'

const x = (from: string, url: string, href?: string): LinkGraphExternal => ({ from, url, host: new URL(url).hostname.replace(/^www\./, ''), anchor: 'a', region: 'main', rel: [], ...(href ? { href } : {}) })

describe('selectExternalTargets（spec S2 §4；第二轮独立审查 #4/#6）', () => {
  it('输入是图谱站外链接（来源只有本站 HTML 页）；按不同来源页数降序、URL 升序；带原始 href', () => {
    const out = selectExternalTargets([
      x('/p1', 'https://b.com/1', 'https://www.b.com/1/'), x('/p1', 'https://b.com/1'), x('/p1', 'https://a.com/1'),
      x('/p2', 'https://b.com/1'), x('/p2', 'https://c.com/1'),
    ])
    expect(out.targets).toEqual([
      { url: 'https://b.com/1', href: 'https://www.b.com/1/' },
      { url: 'https://a.com/1' },
      { url: 'https://c.com/1' },
    ])
  })

  it('反爬平台（含子域）跳过并计数，不发请求（Review Focus 3）', () => {
    const out = selectExternalTargets([x('/', 'https://linkedin.com/company/v'), x('/', 'https://m.facebook.com/v'), x('/', 'https://x.com/v'), x('/', 'https://ok.com/p')])
    expect(out.targets.map((t) => t.url)).toEqual(['https://ok.com/p'])
    expect(out.skippedUrls).toBe(3)
  })

  it('超过上限截断', () => {
    const many = Array.from({ length: EXTERNAL_CHECK_CAP + 7 }, (_, i) => x('/', `https://s${i}.com/p`))
    expect(selectExternalTargets(many).targets).toHaveLength(EXTERNAL_CHECK_CAP)
  })
})

const res = (status: number) => {
  const cancel = vi.fn(async () => undefined)
  return { status, body: { cancel }, cancel } as unknown as Response & { cancel: typeof cancel }
}

describe('checkExternalLinks（spec S2 §4）', () => {
  it('HEAD 404 → GET 复核仍 404 才记 404', async () => {
    const fetchImpl = vi.fn(async () => res(404))
    expect(await checkExternalLinks([{ url: 'https://a.com/gone' }], {}, fetchImpl as never)).toEqual([{ url: 'https://a.com/gone', status: 404, error: null }])
    // HEAD 404 后用 GET 复核（第二轮独立审查 #5）
    expect(fetchImpl.mock.calls.map((c) => (c as unknown as [string, { method: string }])[1].method)).toEqual(['HEAD', 'GET'])
  })

  it('HEAD 405 → 回退 GET 取真实状态并取消响应体（Review Focus 4）', async () => {
    const get = res(200)
    const fetchImpl = vi.fn(async (_u: string, init: { method: string }) => (init.method === 'HEAD' ? res(405) : get))
    const out = await checkExternalLinks([{ url: 'https://a.com/p' }], {}, fetchImpl as never)
    expect(out).toEqual([{ url: 'https://a.com/p', status: 200, error: null }])
    expect(get.cancel).toHaveBeenCalled()
  })

  it('错误分类：超时 / DNS / SSRF 拦截 / 其他；单个失败不影响其他', async () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
    const dns = Object.assign(new Error('getaddrinfo ENOTFOUND nope.invalid'), { code: 'ENOTFOUND' })
    const errors: Record<string, unknown> = {
      'https://t.com/': abort,
      'https://d.com/': dns,
      'https://p.com/': new SsrfBlockedError('blocked private/reserved address: 10.0.0.1'),
      'https://o.com/': new Error('socket hang up'),
    }
    const fetchImpl = vi.fn(async (url: string) => {
      if (errors[url]) throw errors[url]
      return res(200)
    })
    const out = await checkExternalLinks(['https://t.com/', 'https://d.com/', 'https://p.com/', 'https://o.com/', 'https://fine.com/'].map((url) => ({ url })), {}, fetchImpl as never)
    expect(out.map((r) => [r.url, r.status, r.error])).toEqual([
      ['https://t.com/', null, 'timeout'],
      ['https://d.com/', null, 'dns'],
      ['https://p.com/', null, 'blocked_private'],
      ['https://o.com/', null, 'other'],
      ['https://fine.com/', 200, null],
    ])
  })

  it('并发不超过 concurrency', async () => {
    let inFlight = 0
    let peak = 0
    const fetchImpl = vi.fn(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return res(200)
    })
    await checkExternalLinks(Array.from({ length: 10 }, (_, i) => ({ url: `https://c${i}.com/` })), { concurrency: 3 }, fetchImpl as never)
    expect(peak).toBe(3)
  })

  it('请求原始 href，结果以归一化 url 为键（第二轮独立审查 #6）', async () => {
    const fetchImpl = vi.fn(async () => res(200))
    const out = await checkExternalLinks([{ url: 'https://other.com/docs', href: 'https://www.other.com/docs/?ref=abc' }], {}, fetchImpl as never)
    expect((fetchImpl.mock.calls as unknown as [string][])[0][0]).toBe('https://www.other.com/docs/?ref=abc')
    expect(out).toEqual([{ url: 'https://other.com/docs', status: 200, error: null }])
  })

  it('HEAD 404 但 GET 200 → 记 200，不判失效（第二轮独立审查 #5）', async () => {
    const fetchImpl = vi.fn(async (_u: string, init: { method: string }) => res(init.method === 'HEAD' ? 404 : 200))
    expect((await checkExternalLinks([{ url: 'https://w.com/' }], {}, fetchImpl as never))[0].status).toBe(200)
  })

  it('单个请求挂起 → 硬超时记 timeout；整批截止后未开始的记 not_checked（第二轮独立审查 #9）', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('hang')) return new Promise<Response>(() => undefined)
      await new Promise((r) => setTimeout(r, 30))
      return res(200)
    })
    const out = await checkExternalLinks(
      [{ url: 'https://hang.com/' }, { url: 'https://a.com/' }, { url: 'https://b.com/' }, { url: 'https://c.com/' }],
      { concurrency: 1, timeoutMs: 20, deadlineMs: 60 },
      fetchImpl as never,
    )
    expect(out[0]).toEqual({ url: 'https://hang.com/', status: null, error: 'timeout' })
    expect(out.some((r) => r.error === 'not_checked')).toBe(true)
  })

  it('站外请求最多跟随 3 次跳转', async () => {
    const fetchImpl = vi.fn(async () => res(200))
    await checkExternalLinks([{ url: 'https://a.com/' }], {}, fetchImpl as never)
    expect((fetchImpl.mock.calls as unknown as [string, object][])[0][1]).toMatchObject({ maxRedirects: 3 })
  })
})

