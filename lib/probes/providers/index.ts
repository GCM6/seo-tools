import { createOpenAiProbeProvider } from './openai'
import { createPerplexityProbeProvider } from './perplexity'
import { createGeminiProbeProvider } from './gemini'
import { createDeepseekProbeProvider } from './deepseek'
import type { AiProbeProvider } from './types'

export type { AiProbeProvider, AiProbeProviderId, AiProbeAnswer } from './types'

// BYOK：全部实例化，key 缺失的 isConfigured() 为 false，由探针 stage 过滤。
// creds 已由 lib/credentials/store 解析（DB 密文优先、env 回退）。
export function buildProbeProviders(creds: Record<string, string | undefined>): AiProbeProvider[] {
  return [
    createOpenAiProbeProvider({ apiKey: creds.OPENAI_API_KEY ?? '' }),
    createPerplexityProbeProvider({ apiKey: creds.PERPLEXITY_API_KEY ?? '' }),
    createGeminiProbeProvider({ apiKey: creds.GEMINI_API_KEY ?? '' }),
    createDeepseekProbeProvider({ apiKey: creds.DEEPSEEK_API_KEY ?? '' }),
  ]
}

// 向后兼容：无 DB 凭据时（如脚本/测试）直接从 env 建。
export function buildProbeProvidersFromEnv(): AiProbeProvider[] {
  return buildProbeProviders(process.env)
}
