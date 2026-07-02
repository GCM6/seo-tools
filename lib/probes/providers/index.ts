import { createOpenAiProbeProvider } from './openai'
import { createPerplexityProbeProvider } from './perplexity'
import { createGeminiProbeProvider } from './gemini'
import { createDeepseekProbeProvider } from './deepseek'
import type { AiProbeProvider } from './types'

export type { AiProbeProvider, AiProbeProviderId, AiProbeAnswer } from './types'

// BYOK：全部实例化，key 缺失的 isConfigured() 为 false，由探针 stage 过滤。
export function buildProbeProvidersFromEnv(): AiProbeProvider[] {
  return [
    createOpenAiProbeProvider({ apiKey: process.env.OPENAI_API_KEY ?? '' }),
    createPerplexityProbeProvider({ apiKey: process.env.PERPLEXITY_API_KEY ?? '' }),
    createGeminiProbeProvider({ apiKey: process.env.GEMINI_API_KEY ?? '' }),
    createDeepseekProbeProvider({ apiKey: process.env.DEEPSEEK_API_KEY ?? '' }),
  ]
}
