import { describe, expect, it, vi } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { R2ObjectStore, rawObjectKey } from './storage'

describe('R2 raw knowledge storage', () => {
  it('uploads deterministic gzip JSON with a signed S3 request', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit = {}
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedInit = init ?? {}
      return new Response(null, { status: 200 })
    })
    const store = new R2ObjectStore({ accountId: 'acct', accessKeyId: 'access', secretAccessKey: 'secret', bucket: 'raw' }, fetchMock as typeof fetch)
    await store.putJsonGzip('knowledge/google/doc/version.json.gz', { hello: 'world' })
    expect(capturedUrl).toBe('https://acct.r2.cloudflarestorage.com/raw/knowledge/google/doc/version.json.gz')
    expect((capturedInit.headers as Record<string, string>).authorization).toContain('AWS4-HMAC-SHA256')
    expect(JSON.parse(gunzipSync(capturedInit.body as Buffer).toString())).toEqual({ hello: 'world' })
  })
  it('creates a stable, partitioned object key', () => {
    expect(rawObjectKey('reddit_community', 't1:a/b', '2026-08-08T10:20:30.000Z', 'abc')).toBe(
      'knowledge/reddit_community/t1_a_b/2026-08-08T10-20-30-000Z-abc.json.gz',
    )
  })
})
