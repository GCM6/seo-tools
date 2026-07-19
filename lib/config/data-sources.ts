import type { AiProbeProviderId } from '@/lib/probes/providers/types'
import { isGscPlatformConfigured } from '@/lib/gsc/oauth'

// 各真实数据源的配置状态（只看 env 是否给了 key，不发请求验证）。
// 屏 2 的空态用它区分「数据源未接入（配 key）」与「本轮未采集（重新诊断）」，
// 并给出精确到环境变量的指引。仅在服务端使用——不要把 key 本身传给客户端。

export interface DataSourceStatus {
  searchProvider: boolean
  renderProvider: boolean
  // 无托管浏览器时，page_fetch 仍会采集初始 HTML；它不能替代 JS 渲染对比，
  // 但能让技术诊断继续进行，不能因此把整轮诊断阻断。
  renderStaticFallback: true
  aiProviders: AiProbeProviderId[]
  // 平台 OAuth 已就绪（项目是否已授权由 settings/data-sources.ts 单独表达）。
  gsc: boolean
}

export function dataSourceStatus(env: Record<string, string | undefined> = process.env): DataSourceStatus {
  const aiProviders: AiProbeProviderId[] = []
  if (env.OPENAI_API_KEY) aiProviders.push('openai')
  if (env.PERPLEXITY_API_KEY) aiProviders.push('perplexity')
  if (env.GEMINI_API_KEY) aiProviders.push('gemini')
  if (env.DEEPSEEK_API_KEY) aiProviders.push('deepseek')
  return {
    searchProvider: Boolean(env.GOOGLE_CSE_API_KEY && env.GOOGLE_CSE_CX),
    renderProvider: Boolean(
      (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) || env.BROWSERLESS_API_TOKEN,
    ),
    renderStaticFallback: true,
    aiProviders,
    gsc: isGscPlatformConfigured(env),
  }
}
