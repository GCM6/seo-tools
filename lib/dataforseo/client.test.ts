import { describe, it, expect, vi } from 'vitest'
import { createDataforseoClient, asRecord, asArray, asString, asNumber, normalizeDomain } from './client'
import { reasonOf, type RawResponse } from '@/lib/collection/result'
import { DFS_401_BODY } from '@/lib/test-fixtures/real-shapes'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('createDataforseoClient.post', () => {
  it('sets Basic auth header and posts JSON to api.dataforseo.com', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status_code: 20000, tasks: [{ status_code: 20000, result: [] }] }))
    const client = createDataforseoClient({ login: 'user', password: 'pass', fetchImpl: fetchMock })
    await client.post('/v3/serp/google/organic/live/advanced', [{ keyword: 'x' }])

    const [url, init] = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit]
    expect(url).toBe('https://api.dataforseo.com/v3/serp/google/organic/live/advanced')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe(`Basic ${btoa('user:pass')}`)
    expect(headers['content-type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual([{ keyword: 'x' }])
  })

  it('normalizes tasks into { statusCode, statusMessage, result }', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [{ status_code: 20000, status_message: 'Ok.', result: [{ keyword: 'a' }] }],
      }),
    )
    const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock })
    const tasks = await client.post('/x', {})
    expect(tasks).toEqual([{ statusCode: 20000, statusMessage: 'Ok.', result: [{ keyword: 'a' }] }])
  })

  it('throws on HTTP-level error', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 401))
    const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock })
    await expect(client.post('/x', {})).rejects.toThrow(/dataforseo request failed: 401/)
  })

  it('throws on envelope-level status_code error (HTTP 200)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status_code: 40200, status_message: 'Payment Required' }),
    )
    const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock })
    await expect(client.post('/x', {})).rejects.toThrow(/dataforseo error 40200: Payment Required/)
  })

  it('throws on task-level status_code error', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status_code: 20000,
        tasks: [{ status_code: 40501, status_message: 'Invalid Field' }],
      }),
    )
    const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock })
    await expect(client.post('/x', {})).rejects.toThrow(/dataforseo task error 40501: Invalid Field/)
  })

  // SP-A §4.3：原文存档——每个 HTTP 响应（成功、401、信封错误）都交给 onResponse，body 是响应原文。
  it('onResponse 收到每个响应的原文：真实 401（信封 40100、tasks:null）也回调，再抛 http_401', async () => {
    const seen: { path: string; raw: RawResponse }[] = []
    const fetchMock = vi.fn(async () => new Response(DFS_401_BODY, { status: 401, headers: { 'content-type': 'application/json' } }))
    const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock, onResponse: (info) => seen.push(info) })
    const err = await client.post('/v3/serp/google/organic/live/advanced', [{ keyword: 'x' }]).catch((e: unknown) => e)
    expect(reasonOf(err)).toBe('http_401')
    expect(seen).toEqual([{ path: '/v3/serp/google/organic/live/advanced', raw: { status: 401, contentType: 'application/json', body: DFS_401_BODY } }])
  })

  it('信封错误（HTTP 200）也回调 onResponse，抛出的错误原因码为 api_<status_code>', async () => {
    const seen: RawResponse[] = []
    const body = JSON.stringify({ status_code: 40200, status_message: 'Payment Required' })
    const fetchMock = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock, onResponse: ({ raw }) => seen.push(raw) })
    const err = await client.post('/x', {}).catch((e: unknown) => e)
    expect(reasonOf(err)).toBe('api_40200')
    expect(seen.map((r) => r.body)).toEqual([body])
  })

  // 第二波审查 C1：200 但内容不可用不能当成"空数据"——那会让各端点写出全 0 的"测得值"。
  it('200 但响应体不是 JSON（维护页 / 代理页）→ 抛错，原因 invalid_json；原文仍交给 onResponse', async () => {
    const seen: RawResponse[] = []
    const fetchMock = vi.fn(async () => new Response('<html><body>Service temporarily unavailable</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock, onResponse: ({ raw }) => seen.push(raw) })
    expect(reasonOf(await client.post('/x', {}).catch((e: unknown) => e))).toBe('invalid_json')
    expect(seen).toHaveLength(1)
  })

  it('信封没有 tasks（或为空）→ 抛错，原因 no_tasks（每个请求都只提交 1 个任务，必须有任务回来）', async () => {
    for (const body of [{ status_code: 20000 }, { status_code: 20000, tasks: [] }, { status_code: 20000, tasks: null }]) {
      const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: vi.fn(async () => jsonResponse(body)) })
      expect(reasonOf(await client.post('/x', {}).catch((e: unknown) => e)), JSON.stringify(body)).toBe('no_tasks')
    }
  })
})

describe('defensive value helpers', () => {
  it('asRecord only accepts plain objects', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 })
    expect(asRecord([1, 2])).toBeNull()
    expect(asRecord('x')).toBeNull()
    expect(asRecord(null)).toBeNull()
  })
  it('asArray coerces non-arrays to []', () => {
    expect(asArray([1])).toEqual([1])
    expect(asArray({})).toEqual([])
    expect(asArray(undefined)).toEqual([])
  })
  it('asString / asNumber reject wrong types and non-finite', () => {
    expect(asString('a')).toBe('a')
    expect(asString(3)).toBeNull()
    expect(asNumber(3.5)).toBe(3.5)
    expect(asNumber('3')).toBeNull()
    expect(asNumber(NaN)).toBeNull()
  })
})

describe('normalizeDomain', () => {
  it('strips www. and lowercases', () => {
    expect(normalizeDomain('www.Example.COM')).toBe('example.com')
    expect(normalizeDomain('Sub.Example.com')).toBe('sub.example.com')
  })
})
