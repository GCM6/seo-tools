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
    webSearchEnabled: true,
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
      // 协议不兼容检测：HTTP 200 但 output 不是数组，说明响应结构不符合 Responses API 预期——
      // 不静默当空 answer 处理，标记为协议不匹配（与"引擎正常回答但确实没有引用"在数据层区分开）。
      if (!Array.isArray(raw.output)) throw new Error('openai_protocol_mismatch')

      const textParts: string[] = []
      const citedUrls: string[] = []
      // 观测证据：出现 web_search_call 工具调用项，或正文标注了 url_citation。
      let searchEvidenceObserved = false
      for (const item of raw.output) {
        if (item.type === 'web_search_call') searchEvidenceObserved = true
        if (item.type !== 'message') continue
        for (const part of item.content ?? []) {
          if (part.type !== 'output_text') continue
          if (part.text) textParts.push(part.text)
          for (const a of part.annotations ?? []) {
            if (a.type === 'url_citation' && a.url) {
              citedUrls.push(a.url)
              searchEvidenceObserved = true
            }
          }
        }
      }
      const answerText = textParts.join('')
      // 结构合规但解析不出任何正文文本，同样视为协议不匹配（如实标记，不落一条内容为空的 measured 证据）。
      if (answerText === '') throw new Error('openai_protocol_mismatch')

      return {
        answerText,
        citedUrls,
        // OpenAI Responses API 只暴露行内 url_citation 标注，无法区分"仅检索到未引用"的 URL。
        retrievedUrls: [],
        rawResponse: raw,
        webSearchEnabled: true,
        searchEvidenceObserved,
        temperature: null,
        topP: null,
      }
    },
  }
}
