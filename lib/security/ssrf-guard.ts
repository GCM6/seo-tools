import { lookup } from 'node:dns/promises'

export class SsrfBlockedError extends Error {}

const PRIVATE_V4_RANGES: [number, number][] = [
  [ipToInt('10.0.0.0'), ipToInt('10.255.255.255')],
  [ipToInt('172.16.0.0'), ipToInt('172.31.255.255')],
  [ipToInt('192.168.0.0'), ipToInt('192.168.255.255')],
  [ipToInt('127.0.0.0'), ipToInt('127.255.255.255')],
  [ipToInt('169.254.0.0'), ipToInt('169.254.255.255')],
  [ipToInt('0.0.0.0'), ipToInt('0.255.255.255')],
]

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function isPrivateV4(address: string): boolean {
  const n = ipToInt(address)
  return PRIVATE_V4_RANGES.some(([lo, hi]) => n >= lo && n <= hi)
}

function isPrivateV6(address: string): boolean {
  const a = address.toLowerCase()
  return a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80')
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new SsrfBlockedError(`invalid URL: ${rawUrl}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new SsrfBlockedError(`unsupported scheme: ${url.protocol}`)

  const { address, family } = await lookup(url.hostname)
  const blocked = family === 4 ? isPrivateV4(address) : isPrivateV6(address)
  if (blocked) throw new SsrfBlockedError(`blocked private/reserved address: ${address}`)

  return url
}
