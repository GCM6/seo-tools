import type { AiProbeAnswer, AiProbeProvider } from './types'

// DeepSeek 探针：OpenAI 兼容的 chat completions。注意：DeepSeek 开放 API
// 没有联网搜索（网页版才有），回答无引用——证据协议如实记 web_search_enabled=false，
// targetDomainCited 恒为 false；品牌在回答中出现与否仍是有效的可见度信号。

const DEFAULT_MODEL = 'deepseek-chat'

interface DeepseekConfig {
  apiKey: string
  model?: string
  fetchImpl?: typeof fetch
}

interface DeepseekBody {
  choices?: { message?: { content?: string } }[]
}

export function createDeepseekProbeProvider({ apiKey, model, fetchImpl = fetch }: DeepseekConfig): AiProbeProvider {
  const modelId = model || process.env.AI_PROBE_DEEPSEEK_MODEL || DEFAULT_MODEL
  return {
    id: 'deepseek',
    modelId,
    webSearchEnabled: false,
    isConfigured() {
      return Boolean(apiKey)
    },

    async ask(prompt: string): Promise<AiProbeAnswer> {
      if (!this.isConfigured()) throw new Error('deepseek_not_configured')

      const res = await fetchImpl('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: prompt }] }),
      })
      if (!res.ok) throw new Error(`deepseek probe failed: ${res.status}`)

      const raw = (await res.json()) as DeepseekBody
      return {
        answerText: raw.choices?.[0]?.message?.content ?? '',
        citedUrls: [],
        rawResponse: raw,
        webSearchEnabled: false,
        temperature: null,
        topP: null,
      }
    },
  }
}
