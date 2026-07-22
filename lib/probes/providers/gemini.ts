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
    webSearchEnabled: true,
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
      // 协议不兼容检测：HTTP 200 但拿不到 candidates 数组，说明响应结构不符合预期。
      if (!Array.isArray(raw.candidates) || raw.candidates.length === 0) {
        throw new Error('gemini_protocol_mismatch')
      }
      const candidate = raw.candidates[0]
      const answerText = (candidate.content?.parts ?? []).map((p) => p.text ?? '').join('')
      // 结构合规但解析不出任何正文文本，同样视为协议不匹配。
      if (answerText === '') throw new Error('gemini_protocol_mismatch')

      return {
        answerText,
        citedUrls: (candidate.groundingMetadata?.groundingChunks ?? [])
          .map((c) => c.web?.uri)
          .filter((u): u is string => Boolean(u)),
        // groundingChunks 本身就是"回答依据的来源"，Gemini 不单独暴露仅检索未引用的 URL。
        retrievedUrls: [],
        rawResponse: raw,
        webSearchEnabled: true,
        // 观测证据：groundingMetadata 这个结构本身是否出现在响应里（不管 groundingChunks 是否为空）。
        searchEvidenceObserved: candidate.groundingMetadata != null,
        temperature: null,
        topP: null,
      }
    },
  }
}
