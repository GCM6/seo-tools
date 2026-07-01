import { extractMainTextChars } from '@/lib/collection/page-parser'
import type { RenderProvider, RenderResult } from './render-provider'

export interface CloudflareProviderConfig {
  accountId: string
  apiToken: string
  fetchImpl?: typeof fetch
}

interface CfContentResponse {
  success: boolean
  result?: string
  errors?: { message: string }[]
}

export function createCloudflareRenderProvider(config: CloudflareProviderConfig): RenderProvider {
  const fetchImpl = config.fetchImpl ?? fetch

  return {
    async renderMainText(url: string): Promise<RenderResult> {
      const res = await fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/browser-rendering/content`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ url }),
        },
      )
      const body = (await res.json()) as CfContentResponse
      if (!body.success || typeof body.result !== 'string')
        throw new Error(`Cloudflare Browser Rendering failed: ${body.errors?.[0]?.message ?? 'unknown error'}`)

      return { html: body.result, mainTextChars: extractMainTextChars(body.result) }
    },
  }
}
