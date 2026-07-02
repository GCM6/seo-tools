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

export interface SearchVisibilityProvider {
  isConfigured(): boolean
  checkSite(domain: string): Promise<SearchVisibilityResult>
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

      const query = `site:${domain}`
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
        provider: 'google_custom_search',
        query,
        domain,
        totalResults: parseTotalResults(body.searchInformation?.totalResults),
        resultCount: results.length,
        homePagePresent: results.some((item) => isHomePage(item.link, domain)),
        firstResultUrl: results[0]?.link ?? null,
        results,
        checkedAt: new Date().toISOString(),
      }
    },
  }
}
