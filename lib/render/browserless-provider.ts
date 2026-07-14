import { extractMainTextChars } from '@/lib/collection/page-parser'
import type { RenderProvider, RenderResult } from './render-provider'

export interface BrowserlessProviderConfig {
  apiToken: string
  // 托管 Browserless 默认 /content；自托管时填写 http(s)://<host>/chromium/content。
  contentUrl?: string
  fetchImpl?: typeof fetch
}

export function createBrowserlessRenderProvider(config: BrowserlessProviderConfig): RenderProvider {
  const fetchImpl = config.fetchImpl ?? fetch
  const contentUrl = config.contentUrl || 'https://production-sfo.browserless.io/content'

  return {
    isConfigured() {
      return Boolean(config.apiToken)
    },
    async renderMainText(url: string): Promise<RenderResult> {
      const endpoint = new URL(contentUrl)
      endpoint.searchParams.set('token', config.apiToken)
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cache-control': 'no-cache' },
        body: JSON.stringify({ url }),
      })
      const html = await res.text()
      if (!res.ok || !html.trim())
        throw new Error(`Browserless rendering failed: ${res.status}${html ? ` ${html.slice(0, 240)}` : ''}`)

      return { html, mainTextChars: extractMainTextChars(html) }
    },
  }
}
