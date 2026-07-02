// URL 归一化：全站爬取的去重键。同一页面的各种写法（www、尾斜杠、utm、fragment、query 顺序）归一到同一字符串。
const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|msclkid|ref)$/i

export function normalizeUrl(raw: string, base?: string): string | null {
  let u: URL
  try {
    u = new URL(raw, base)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  u.hash = ''
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) u.searchParams.delete(key)
  }
  u.searchParams.sort()
  u.hostname = u.hostname.replace(/^www\./, '')
  if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '')
  return u.toString()
}

export function sameSiteHost(entryUrl: string): string {
  return new URL(entryUrl).hostname.replace(/^www\./, '')
}

export function isSameSite(url: string, entryHost: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, '') === entryHost
  } catch {
    return false
  }
}
