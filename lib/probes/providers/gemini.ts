import type { AiProbeAnswer, AiProbeProvider } from './types'

// Gemini 探针：generateContent + google_search grounding，引用取 groundingChunks。

const DEFAULT_MODEL = 'gemini-2.5-flash'

interface GeminiConfig {
  apiKey: string
  model?: string
  fetchImpl?: typeof fetch
}

interface GeminiBody {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] }
  }[]
}

export function createGeminiProbeProvider({ apiKey, model, fetchImpl = fetch }: GeminiConfig): AiProbeProvider {
  const modelId = model || process.env.AI_PROBE_GEMINI_MODEL || DEFAULT_MODEL
  return {
    id: 'gemini',
    modelId,
    isConfigured() {
      return Boolean(apiKey)
    },

    async ask(prompt: string): Promise<AiProbeAnswer> {
      if (!this.isConfigured()) throw new Error('gemini_not_configured')

      const res = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
        },
      )
      if (!res.ok) throw new Error(`gemini probe failed: ${res.status}`)

      const raw = (await res.json()) as GeminiBody
      const candidate = raw.candidates?.[0]
      return {
        answerText: (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
        citedUrls: (candidate?.groundingMetadata?.groundingChunks ?? [])
          .map((c) => c.web?.uri)
          .filter((u): u is string => Boolean(u)),
        rawResponse: raw,
        webSearchEnabled: true,
        temperature: null,
        topP: null,
      }
    },
  }
}
