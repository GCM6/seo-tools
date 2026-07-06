import { describe, it, expect, vi } from 'vitest'
import { createDataforseoClient, asRecord, asArray, asString, asNumber, normalizeDomain } from './client'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('createDataforseoClient.post', () => {
  it('sets Basic auth header and posts JSON to api.dataforseo.com', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status_code: 20000, tasks: [] }))
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

  it('defends against a malformed envelope (no tasks) by returning []', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status_code: 20000 }))
    const client = createDataforseoClient({ login: 'u', password: 'p', fetchImpl: fetchMock })
    expect(await client.post('/x', {})).toEqual([])
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
