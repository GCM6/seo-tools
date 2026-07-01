// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { assertPublicUrl, SsrfBlockedError } from './ssrf-guard'

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}))

import { lookup } from 'node:dns/promises'

afterEach(() => vi.mocked(lookup).mockReset())

describe('assertPublicUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicUrl('ftp://example.com')).rejects.toThrow(SsrfBlockedError)
  })

  it('rejects private IPv4 ranges', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '10.0.0.5', family: 4 })
    await expect(assertPublicUrl('http://internal.example.com')).rejects.toThrow(SsrfBlockedError)
  })

  it('rejects loopback and link-local (incl. cloud metadata)', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '169.254.169.254', family: 4 })
    await expect(assertPublicUrl('http://metadata.example.com')).rejects.toThrow(SsrfBlockedError)
  })

  it('accepts a public IPv4 address', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '93.184.216.34', family: 4 })
    const url = await assertPublicUrl('https://example.com/page')
    expect(url.hostname).toBe('example.com')
  })
})