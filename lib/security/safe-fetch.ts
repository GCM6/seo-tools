import { assertPublicUrl } from './ssrf-guard'

export interface SafeFetchInit extends RequestInit {
  maxRedirects?: number
  timeoutMs?: number
}

export async function safeFetch(rawUrl: string, init: SafeFetchInit = {}): Promise<Response> {
  const { maxRedirects = 5, timeoutMs = 10_000, ...requestInit } = init
  let currentUrl = (await assertPublicUrl(rawUrl)).toString()
  // 跳转途中下发的 Cookie 按主机保存并在后续同主机跳转中带上（浏览器同样会带）：Cookie 门控的自跳转不是循环。
  // 同一 URL 在 Cookie 不变时再次出现 = 确定性循环，立即报错（链接完整性据此把它当断链，2026-10-03 jac.com.cn 冒烟）。
  const jar = new Map<string, Map<string, string>>()
  const visited = new Set<string>()

  for (let hop = 0; ; hop++) {
    const host = new URL(currentUrl).host
    const cookie = [...(jar.get(host) ?? [])].map(([k, v]) => `${k}=${v}`).join('; ')
    const visitKey = `${currentUrl}\n${cookie}`
    if (visited.has(visitKey)) throw new Error(`too many redirects (redirect loop) fetching ${rawUrl}`)
    visited.add(visitKey)
    const headers = new Headers(requestInit.headers)
    if (cookie) headers.set('cookie', cookie)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(currentUrl, { ...requestInit, headers, redirect: 'manual', signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (res.status < 300 || res.status >= 400 || !res.headers.get('location')) return res

    if (hop >= maxRedirects) throw new Error(`too many redirects fetching ${rawUrl}`)
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';')
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const cookies = jar.get(host) ?? new Map<string, string>()
      cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
      jar.set(host, cookies)
    }
    const nextUrl = new URL(res.headers.get('location')!, currentUrl).toString()
    currentUrl = (await assertPublicUrl(nextUrl)).toString()
  }
}
