import { createBrowserlessRenderProvider } from './browserless-provider'
import { createCloudflareRenderProvider } from './cloudflare-provider'
import type { RenderProvider } from './render-provider'

export type RenderCredentials = Record<string, string | undefined>

// 两个 provider 都返回真实浏览器渲染后的 HTML，写入的 render_check 证据合同完全一致。
// Cloudflare 保持既有优先级；未配置时无缝切到 Browserless（托管或自托管）。
export function selectRenderProvider(credentials: RenderCredentials): RenderProvider {
  const cloudflareAccountId = credentials['CLOUDFLARE_ACCOUNT_ID']
  const cloudflareApiToken = credentials['CLOUDFLARE_API_TOKEN']
  if (cloudflareAccountId && cloudflareApiToken) {
    return createCloudflareRenderProvider({
      accountId: cloudflareAccountId,
      apiToken: cloudflareApiToken,
    })
  }
  return createBrowserlessRenderProvider({
    apiToken: credentials['BROWSERLESS_API_TOKEN'] ?? '',
    contentUrl: credentials['BROWSERLESS_CONTENT_URL'],
  })
}
