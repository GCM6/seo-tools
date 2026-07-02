import type { AiProbeAnswer, AiProbeProvider } from './types'

// ChatGPT 探针：OpenAI Responses API + web_search 工具（带引用的联网回答）。
// 模型默认值可用 AI_PROBE_OPENAI_MODEL 覆盖。

const DEFAULT_MODEL = 'gpt-5-mini'

interface OpenAiConfig {
  apiKey: string
  model?: string
  fetchImpl?: typeof fetch
}

interface OpenAiResponsesBody {
  output?: {
    type?: string
    content?: {
      type?: string
      text?: string
      annotations?: { type?: string; url?: string }[]
    }[]
  }[]
}

export function createOpenAiProbeProvider({ apiKey, model, fetchImpl = fetch }: OpenAiConfig): AiProbeProvider {
  const modelId = model || process.env.AI_PROBE_OPENAI_MODEL || DEFAULT_MODEL
  return {
    id: 'openai',
    modelId,
    isConfigured() {
      return Boolean(apiKey)
    },

    async ask(prompt: string): Promise<AiProbeAnswer> {
      if (!this.isConfigured()) throw new Error('openai_not_configured')

      const res = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelId, input: prompt, tools: [{ type: 'web_search' }] }),
      })
      if (!res.ok) throw new Error(`openai probe failed: ${res.status}`)

      const raw = (await res.json()) as OpenAiResponsesBody
      const textParts: string[] = []
      const citedUrls: string[] = []
      for (const item of raw.output ?? []) {
        if (item.type !== 'message') continue
        for (const part of item.content ?? []) {
          if (part.type !== 'output_text') continue
          if (part.text) textParts.push(part.text)
          for (const a of part.annotations ?? []) {
            if (a.type === 'url_citation' && a.url) citedUrls.push(a.url)
          }
        }
      }
      return {
        answerText: textParts.join(''),
        citedUrls,
        rawResponse: raw,
        webSearchEnabled: true,
        temperature: null,
        topP: null,
      }
    },
  }
}
