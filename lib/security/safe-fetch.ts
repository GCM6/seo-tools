import { assertPublicUrl } from './ssrf-guard'

export interface SafeFetchInit extends RequestInit {
  maxRedirects?: number
  timeoutMs?: number
}

export async function safeFetch(rawUrl: string, init: SafeFetchInit = {}): Promise<Response> {
  const { maxRedirects = 5, timeoutMs = 10_000, ...requestInit } = init
  let currentUrl = (await assertPublicUrl(rawUrl)).toString()

  for (let hop = 0; ; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(currentUrl, { ...requestInit, redirect: 'manual', signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (res.status < 300 || res.status >= 400 || !res.headers.get('location')) return res

    if (hop >= maxRedirects) throw new Error(`too many redirects fetching ${rawUrl}`)
    const nextUrl = new URL(res.headers.get('location')!, currentUrl).toString()
    currentUrl = (await assertPublicUrl(nextUrl)).toString()
  }
}
