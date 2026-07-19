import type { AiProbeAnswer, AiProbeProvider } from './types'

// Perplexity 探针：sonar 系列自带联网检索与引用。
// 两种引用形状语义不同，不能压平合并（此前的实现把两者拼进同一个 citedUrls，
// 导致 targetDomainCited / grounded 判定虚高——search_results 只是"引擎检索到过"，
// 不代表正文真的引用了它）：
//   - citations[]：正文标注引用的来源 → citedUrls（"有依据"判定只认这个）；
//   - search_results[].url：引擎联网检索到、但正文未必引用 → retrievedUrls（弱一档）。
// 与 citations 重叠的 URL 从 retrievedUrls 去重（同一 URL 若已在 citedUrls，
// 不重复计入"仅检索到"，否则会低估 grounded、又高估 retrieved-only）。

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
      const citedUrls = raw.citations ?? []
      const citedSet = new Set(citedUrls)
      const fromSearchResults = (raw.search_results ?? []).map((r) => r.url).filter((u): u is string => Boolean(u))
      // 去重：既在 citedUrls 也在 search_results 里的 URL，只算作 cited，不重复进 retrievedUrls。
      const retrievedUrls = [...new Set(fromSearchResults)].filter((u) => !citedSet.has(u))
      return {
        answerText: raw.choices?.[0]?.message?.content ?? '',
        citedUrls,
        retrievedUrls,
        rawResponse: raw,
        webSearchEnabled: true,
        temperature: null,
        topP: null,
      }
    },
  }
}
