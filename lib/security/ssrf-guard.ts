import { lookup } from 'node:dns/promises'

export class SsrfBlockedError extends Error {}

const PRIVATE_V4_RANGES: [number, number][] = [
  [ipToInt('10.0.0.0'), ipToInt('10.255.255.255')],
  [ipToInt('172.16.0.0'), ipToInt('172.31.255.255')],
  [ipToInt('192.168.0.0'), ipToInt('192.168.255.255')],
  [ipToInt('127.0.0.0'), ipToInt('127.255.255.255')],
  [ipToInt('169.254.0.0'), ipToInt('169.254.255.255')],
  [ipToInt('0.0.0.0'), ipToInt('0.255.255.255')],
  // 第二轮独立审查 #11：站外链接抽检会请求任意页面内容里的主机，补齐保留网段。
  [ipToInt('100.64.0.0'), ipToInt('100.127.255.255')], // CGNAT（云内网常用）
  [ipToInt('192.0.0.0'), ipToInt('192.0.0.255')], // IETF 协议分配
  [ipToInt('192.0.2.0'), ipToInt('192.0.2.255')], // TEST-NET-1
  // 刻意不封 198.18.0.0/15（基准测试网段）：Clash 等代理的 fake-ip 模式把所有域名解析到 198.18.x.x，
  // 封掉会让本机开发/自托管环境全部抓取失败（2026-10-03 真实站点冒烟实测），且该网段几乎不承载内网服务。
  [ipToInt('198.51.100.0'), ipToInt('198.51.100.255')], // TEST-NET-2
  [ipToInt('203.0.113.0'), ipToInt('203.0.113.255')], // TEST-NET-3
  [ipToInt('224.0.0.0'), ipToInt('255.255.255.255')], // 组播 + 保留 + 广播
]

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function isPrivateV4(address: string): boolean {
  const n = ipToInt(address)
  return PRIVATE_V4_RANGES.some(([lo, hi]) => n >= lo && n <= hi)
}

// IPv4 映射/兼容的 IPv6（::ffff:127.0.0.1、::ffff:7f00:1）按内嵌 IPv4 判定，否则可绕过 v4 网段检查。
function embeddedV4(a: string): string | null {
  const dotted = /^::(ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a)
  if (dotted) return dotted[2]
  const hex = /^::(ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a)
  if (hex) {
    const hi = parseInt(hex[2], 16)
    const lo = parseInt(hex[3], 16)
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
  }
  return null
}

function isPrivateV6(address: string): boolean {
  const a = address.toLowerCase()
  const v4 = embeddedV4(a)
  if (v4) return isPrivateV4(v4)
  return (
    a === '::' || a === '::1' ||
    a.startsWith('fc') || a.startsWith('fd') || // ULA
    /^fe[89ab]/.test(a) || // 链路本地 fe80::/10
    /^fe[c-f]/.test(a) || // 站点本地 fec0::/10（已弃用但仍可路由到内网）
    a.startsWith('ff') // 组播
  )
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
