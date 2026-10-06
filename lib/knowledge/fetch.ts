export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: { retries?: number; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 3
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) })
      if (response.status !== 429 && response.status < 500) return response
      if (attempt === retries) return response
      const retryAfter = Number(response.headers.get('retry-after') ?? '0')
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt))
    } catch (error) {
      lastError = error
      if (attempt === retries) throw error
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('fetch_failed')
}

