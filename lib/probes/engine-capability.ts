// D3/D6（spec docs/superpowers/specs/2026-07-13-geo-branded-unbranded-redesign.md）：
// 引擎联网能力判定 + branded 回答五态分类的唯一真源。
//
// Wave 2 并行开发期间，同一套判定逻辑被复制了三份：
//   - lib/probes/summary.ts 的私有 WEB_SEARCH_CAPABILITY + resolveWebSearchEnabled +
//     branded.perEngine 聚合循环里内联的五态判定（这份是被测试钉死的行为基准）；
//   - lib/diagnosis/rules/geo.ts 的 GEO_WEB_SEARCH_CAPABILITY + isWebSearchEnabledEngine；
//   - components/probeEngineCapability.ts 的 resolveWebSearchEnabled + classifyBrandedAnswer。
// Wave 3 收口：本文件是唯一实现，其余三处改为直接 import（components 那份保留文件仅做 re-export，
// 避免变更其既有调用方的 import 路径）。判定顺序严格保持 summary.ts 收口前的行为，零改变。

// 引擎联网能力静态兜底表：目前只有 DeepSeek 是「记忆型」（开放 API 无联网搜索，citedUrls 结构上恒空），
// 其余已知 provider 均为「检索型」；未登记的 provider 保守按检索型处理（不缺省判它为无引用能力）。
const WEB_SEARCH_CAPABILITY: Record<string, boolean> = {
  openai: true,
  perplexity: true,
  gemini: true,
  deepseek: false,
}

export function resolveWebSearchEnabled(provider: string | undefined, explicit: boolean | undefined): boolean {
  if (explicit != null) return explicit
  if (!provider) return true
  return WEB_SEARCH_CAPABILITY[provider] ?? true
}

// D3：branded 问题回答的认知质量五态。
export type BrandedAnswerState = 'grounded' | 'speculative' | 'unknown' | 'unverified' | 'undetermined'

export interface ClassifiableAnswer {
  provider?: string
  webSearchEnabled?: boolean
  citedUrls?: string[]
  hedged?: boolean
  unknownAdmission?: boolean
}

// D3 三态判定按引用能力分流（判定顺序即优先级，spec D3 原文顺序）：
// 联网引擎（webSearchEnabled=true）：citedUrls 非空 → grounded；否则 hedged → speculative；
// 否则 unknownAdmission → unknown；都没有 → unverified（断言式回答无依据）。
// 非联网引擎（结构上无引用能力，citedUrls 恒空，禁止当"无依据"）：只 hedged → speculative；
// unknownAdmission → unknown；否则 undetermined（无引用能力，未判定）。
export function classifyBrandedAnswer(answer: ClassifiableAnswer): BrandedAnswerState {
  const webSearchEnabled = resolveWebSearchEnabled(answer.provider, answer.webSearchEnabled)
  const cited = (answer.citedUrls ?? []).length > 0
  if (webSearchEnabled) {
    if (cited) return 'grounded'
    if (answer.hedged) return 'speculative'
    if (answer.unknownAdmission) return 'unknown'
    return 'unverified'
  }
  if (answer.hedged) return 'speculative'
  if (answer.unknownAdmission) return 'unknown'
  return 'undetermined'
}

// geo.ts G06 用：判断某引擎是否具备联网引用能力。优先用 branded 层已按 provider 判定的
// webSearchEnabled（probe.branded.perEngine 由聚合层按上面同一逻辑算好），该引擎无 branded
// 样本时退回静态兜底表。参数按结构类型声明，避免与 lib/probes/summary.ts 的 ProbeSummary
// 类型产生模块间循环 import。
export function isWebSearchEnabledEngine(
  probe: { branded: { perEngine: { provider: string; webSearchEnabled: boolean }[] } },
  engine: string,
): boolean {
  const branded = probe.branded.perEngine.find((e) => e.provider === engine)
  if (branded) return branded.webSearchEnabled
  return resolveWebSearchEnabled(engine, undefined)
}
