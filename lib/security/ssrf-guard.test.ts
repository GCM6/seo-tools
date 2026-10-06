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

  // 第二轮独立审查 #11：站外链接抽检会请求任意页面内容里的主机，这些形态此前能绕过守卫。
  it.each([
    ['::ffff:127.0.0.1', 6], ['::ffff:7f00:1', 6], ['::ffff:10.0.0.1', 6], ['::', 6], ['100.64.0.1', 4], ['100.127.255.254', 4],
    ['192.0.0.8', 4], ['224.0.0.1', 4], ['255.255.255.255', 4], ['fec0::1', 6],
  ] as const)('rejects %s', async (address, family) => {
    vi.mocked(lookup).mockResolvedValue({ address, family })
    await expect(assertPublicUrl('http://sneaky.example.com')).rejects.toThrow(SsrfBlockedError)
  })

  // 198.18.x.x：代理 fake-ip 模式的解析结果，必须放行（见守卫注释）。
  it.each([['::ffff:93.184.216.34', 6], ['2606:2800:220:1:248:1893:25c8:1946', 6], ['100.128.0.1', 4], ['198.18.25.183', 4]] as const)('accepts public %s', async (address, family) => {
    vi.mocked(lookup).mockResolvedValue({ address, family })
    await expect(assertPublicUrl('http://ok.example.com')).resolves.toBeInstanceOf(URL)
  })
})

