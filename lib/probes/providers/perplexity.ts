import type { AiProbeAnswer, AiProbeProvider } from './types'

// Perplexity 探针：sonar 系列自带联网检索与引用。
// 引用字段两种响应形状都兼容：顶层 citations[] 与 search_results[].url。

const DEFAULT_MODEL = 'sonar'

interface PerplexityConfig {
  apiKey: string
  model?: string
  fetchImpl?: typeof fetch
}

interface PerplexityBody {
  choices?: { message?: { content?: string } }[]
  citations?: string[]
  search_results?: { url?: string }[]
}

export function createPerplexityProbeProvider({ apiKey, model, fetchImpl = fetch }: PerplexityConfig): AiProbeProvider {
  const modelId = model || process.env.AI_PROBE_PERPLEXITY_MODEL || DEFAULT_MODEL
  return {
    webSearchEnabled: true,
    id: 'perplexity',
    modelId,
    isConfigured() {
      return Boolean(apiKey)
    },

    async ask(prompt: string): Promise<AiProbeAnswer> {
      if (!this.isConfigured()) throw new Error('perplexity_not_configured')

      const res = await fetchImpl('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: prompt }] }),
      })
      if (!res.ok) throw new Error(`perplexity probe failed: ${res.status}`)

      const raw = (await res.json()) as PerplexityBody
      const fromCitations = raw.citations ?? []
      const fromSearchResults = (raw.search_results ?? []).map((r) => r.url).filter((u): u is string => Boolean(u))
      return {
        answerText: raw.choices?.[0]?.message?.content ?? '',
        citedUrls: [...fromCitations, ...fromSearchResults],
        rawResponse: raw,
        webSearchEnabled: true,
        temperature: null,
        topP: null,
      }
    },
  }
}
