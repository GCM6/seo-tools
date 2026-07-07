// 规范化用户输入的站点地址：裸域名补 https://，并校验可解析为 http(s) URL。
// domain 会被下游当作抓取入口 URL 喂给 assertPublicUrl(new URL(...))，若不补 scheme，
// 裸域名会让 new URL 抛错，使新建 run 一创建就 failed。POST /projects 与 PATCH 共用。
export function normalizeDomain(raw: string): string | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}
