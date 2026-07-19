export interface SearchVisibilityResult {
  provider: 'google_custom_search'
  query: string
  domain: string
  totalResults: number | null
  resultCount: number
  homePagePresent: boolean
  firstResultUrl: string | null
  results: { title: string; link: string; snippet: string }[]
  checkedAt: string
}

// 通用 CSE 查询结果——不带 domain 语义（homePagePresent/firstResultUrl 等），
// 供 social-presence 等复用同一 CSE 通道、但查询任意 query 字符串的采集器使用。
export interface RawSearchResult {
  query: string
  totalResults: number | null
  resultCount: number
  results: { title: string; link: string; snippet: string }[]
  checkedAt: string
}

export interface SearchVisibilityProvider {
  isConfigured(): boolean
  checkSite(domain: string): Promise<SearchVisibilityResult>
  // 任意查询字符串（如 site:youtube.com "brand"）复用同一 CSE 凭据/通道。
  search(query: string): Promise<RawSearchResult>
}

interface GoogleCseConfig {
  apiKey: string
  cx: string
  fetchImpl?: typeof fetch
}

interface GoogleCseResponse {
  searchInformation?: { totalResults?: string }
  items?: { title?: string; link?: string; snippet?: string }[]
}

function parseTotalResults(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isHomePage(link: string, domain: string): boolean {
  try {
    const url = new URL(link)
    const host = url.hostname.replace(/^www\./, '')
    const target = domain.replace(/^www\./, '')
    return host === target && (url.pathname === '' || url.pathname === '/')
  } catch {
    return false
  }
}

// 共享的底层 CSE 请求：checkSite 与 search 都走这一条路径，只是 query 构造方式不同。
async function performSearch(
  query: string,
  apiKey: string,
  cx: string,
  fetchImpl: typeof fetch,
): Promise<RawSearchResult> {
  const url = new URL('https://www.googleapis.com/customsearch/v1')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('cx', cx)
  url.searchParams.set('q', query)
  url.searchParams.set('num', '10')

  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`Google Custom Search failed: ${res.status}`)

  const body = (await res.json()) as GoogleCseResponse
  const results = (body.items ?? []).map((item) => ({
    title: item.title ?? '',
    link: item.link ?? '',
    snippet: item.snippet ?? '',
  }))

  return {
    query,
    totalResults: parseTotalResults(body.searchInformation?.totalResults),
    resultCount: results.length,
    results,
    checkedAt: new Date().toISOString(),
  }
}

export function createGoogleCseSearchVisibilityProvider({
  apiKey,
  cx,
  fetchImpl = fetch,
}: GoogleCseConfig): SearchVisibilityProvider {
  return {
    isConfigured() {
      return Boolean(apiKey && cx)
    },

    async checkSite(domain: string): Promise<SearchVisibilityResult> {
      if (!this.isConfigured()) throw new Error('google_custom_search_not_configured')

      const raw = await performSearch(`site:${domain}`, apiKey, cx, fetchImpl)

      return {
        provider: 'google_custom_search',
        query: raw.query,
        domain,
        totalResults: raw.totalResults,
        resultCount: raw.resultCount,
        homePagePresent: raw.results.some((item) => isHomePage(item.link, domain)),
        firstResultUrl: raw.results[0]?.link ?? null,
        results: raw.results,
        checkedAt: raw.checkedAt,
      }
    },

    async search(query: string): Promise<RawSearchResult> {
      if (!this.isConfigured()) throw new Error('google_custom_search_not_configured')
      return performSearch(query, apiKey, cx, fetchImpl)
    },
  }
}
