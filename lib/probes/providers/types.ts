// AI 探针 provider 统一接口。铁律：适配器只负责「调用 + 原样带回原始响应」，
// 不做任何解析判断（brand/竞品匹配在 parse.ts 的确定性解析器里做）。

export type AiProbeProviderId = 'openai' | 'perplexity' | 'gemini' | 'deepseek'

export interface AiProbeAnswer {
  answerText: string
  // 正文中真正引用/标注来源的 URL（如 Perplexity citations[]、OpenAI url_citation、
  // Gemini groundingChunks）。判定五态 grounded、citesDomain 只认这个字段。
  citedUrls: string[]
  // 仅被引擎联网检索到、但未在正文标注引用的 URL（如 Perplexity search_results[].url）。
  // 结构上比 citedUrls 弱一档证据——引擎"看到过"不等于"正文依据了"，不得计入 grounded 判定。
  // 非 Perplexity 的 provider 目前无法区分二者，恒为空数组（不是缺失，是协议如实记录）。
  retrievedUrls: string[]
  rawResponse: unknown
  webSearchEnabled: boolean
  // 观测事实，非声明：本次响应里是否真的出现了检索/引用相关的结构证据
  // （OpenAI：url_citation 标注或 web_search_call 工具调用项；Perplexity：citations/search_results
  // 字段存在——字段存在即证据，空数组也算，与字段完全缺失是两回事；Gemini：groundingMetadata 存在；
  // DeepSeek：恒 false）。与 webSearchEnabled（该引擎被声明为联网型，静态属性）是两个独立维度：
  // 一个真正联网的引擎完全可能合理地本次什么都没引用，不能把"没引用"等同于"没联网"。
  searchEvidenceObserved: boolean
  // 未显式设置的参数记 null（协议要求留痕，不虚构默认值）
  temperature: number | null
  topP: number | null
}

export interface AiProbeProvider {
  id: AiProbeProviderId
  modelId: string
  // 该 provider 是否联网检索（DeepSeek 开放 API 为 false）；错误留痕时也要如实记录
  webSearchEnabled: boolean
  isConfigured(): boolean
  ask(prompt: string): Promise<AiProbeAnswer>
}
