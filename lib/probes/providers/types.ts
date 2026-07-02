// AI 探针 provider 统一接口。铁律：适配器只负责「调用 + 原样带回原始响应」，
// 不做任何解析判断（brand/竞品匹配在 parse.ts 的确定性解析器里做）。

export type AiProbeProviderId = 'openai' | 'perplexity' | 'gemini'

export interface AiProbeAnswer {
  answerText: string
  citedUrls: string[]
  rawResponse: unknown
  webSearchEnabled: boolean
  // 未显式设置的参数记 null（协议要求留痕，不虚构默认值）
  temperature: number | null
  topP: number | null
}

export interface AiProbeProvider {
  id: AiProbeProviderId
  modelId: string
  isConfigured(): boolean
  ask(prompt: string): Promise<AiProbeAnswer>
}
