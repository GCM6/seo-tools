// 探针结果聚合：AI 可见度（X/20）、答案出现地图、竞品 SoV 的唯一数据来源。
// 纯函数：只消费已落库的 prompts + ai_probe_results，绝不产出无证据支撑的数字。

import { competitorsInText } from './parse'
import { wilsonLowerBound } from '@/lib/stats/wilson'
import { resolveWebSearchEnabled, classifyBrandedAnswer } from './engine-capability'
import { classifyCitationOrigin } from './citation-origin'
import { classifyCitationPlatform, isUgcPlatform, type CitationPlatform } from './citation-platform'

// D6（分引擎语义标注）：引擎按 webSearchEnabled 分「检索型 / 记忆型」。summary 是纯函数，
// 不做 IO——调用方理应把每条结果实测到的 web_search_enabled 传进来（evidence payload 已落
// 该字段，参见 deepseek.ts:3-5 注释）；读不到时按 provider 静态能力表兜底。判定实现（含五态
// 分类）已收口到 lib/probes/engine-capability.ts，作为 lib/diagnosis/rules/geo.ts 与
// components/probeEngineCapability.ts 的唯一真源（Wave 3 消除三份复制）。

// 项目 domain 归一化：projects.domain 落库时可能带协议/www（如 "https://www.example.com"），
// 而 ProbeSummaryInput.domain（供 owned/third_party 判定，见下方注释）以及
// classifyCitationOrigin/hostMatchesDomain 期望的是裸 host。三处调用点（lib/inngest/
// generate-findings.ts 的 run-rules step + 回测 buildRunMetrics、lib/inngest/
// reevaluate-competitors.ts）共用这一份实现，不各写一份。解析失败（domain 本就是裸 host，
// 不是合法 URL）时原样返回，不抛错。
export function normalizeProjectDomain(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '')
  } catch {
    return raw
  }
}

export interface ProbeSummaryInput {
  prompts: { id: string; text: string; priority: number; branded?: boolean }[]
  results: {
    promptId: string
    brandPresent: boolean
    competitorsMentioned: string[]
    evidenceId: string
    // Phase D：分引擎报告与情感聚合所需（旧调用方可不传，聚合优雅降级）。
    provider?: string
    sentiment?: string
    // SP-A2 #6：原始回答文本。带原文即对「当前竞品集」重解析（解掉探针期冻结）；
    // 缺省则回退冻结的 competitorsMentioned（旧调用方不回归）。
    answerText?: string
    // D2/D3：确定性词表信号（parse.ts v4）——猜测标记 / 承认不知道。旧调用方不传按 false 处理。
    hedged?: boolean
    unknownAdmission?: boolean
    // D3：引用 URL 列表；旧调用方不传按「无引用」处理（不影响 unbranded 层，只影响 branded 三态判定）。
    citedUrls?: string[]
    // D3/D6：该条结果所属引擎当次是否具备联网引用能力；不传按 provider 静态能力表兜底。
    webSearchEnabled?: boolean
  }[]
  brand: string
  competitors: string[]
  // ⑤（引用来源归属分类）：目标域名，供 citedDomains 判定 owned/third_party。可选——旧调用方
  // 不传时无法验证"自有"，保守把全部被引用域名归为 third_party（不产出无证据结论）。
  domain?: string
}

// 引用情感分布（G09）：对含品牌样本按 sentiment 计数。分类器是测量层解析器（parser_version 版本化）。
export interface SentimentBreakdown {
  positive: number
  neutral: number
  negative: number
  comparison: number
  total: number
}

// ⑤：被引用域名分布条目——域名（已归一去 www）、出现次数、owned/third_party 归属、平台分类。
export interface CitedDomainEntry {
  domain: string
  count: number
  origin: 'owned' | 'third_party'
  // 平台分类（新增）：域名→已知社区/参考类平台，认不出的域名一律 'other'（不猜测），
  // 分类实现见 citation-platform.ts。
  platform: CitationPlatform
}

export interface SovEntry {
  name: string
  pct: number
  you: boolean
}

// 分引擎 SoV（SP-A2 #6）：引擎不可互推（§7.3），竞品 SoV 亦分引擎分列。
export interface EngineSov {
  engine: string
  samples: number
  sov: SovEntry[]
}

// D3：branded 问题回答的认知质量三态（+ 联网引擎的 grounded/unverified），按引擎分列。
// 联网引擎（webSearchEnabled=true）：grounded / speculative / unknown / unverified 四选一，undetermined 恒 0。
// 非联网引擎（如 DeepSeek）：citedUrls 结构上恒空、禁止当"无依据"，只有 speculative / unknown /
// undetermined（无引用能力，未判定）三选一，grounded / unverified 恒 0。
export interface BrandedEngineBreakdown {
  provider: string
  webSearchEnabled: boolean
  grounded: number
  speculative: number
  unknown: number
  unverified: number
  undetermined: number
}

export interface ProbeSummary {
  promptsTotal: number
  promptsPresent: number
  totalSamples: number
  // 每个问题都保留其底层探针样本，使展示层能打开原始回答，而非把地图误读成排名热力图。
  perPrompt: {
    text: string
    present: boolean
    // D1：该问题文本本身是否含品牌/别名（透传自 prompts.branded），供 UI 拆两区展示用。
    branded: boolean
    answers: { provider?: string; answerText?: string; evidenceId: string; present: boolean }[]
  }[]
  // D4：SoV 只在 unbranded 子集计算——branded 问题里模型必然复述品牌名，混进 SoV 会失真。
  sov: SovEntry[]
  // 分引擎竞品 SoV（SP-A2 #6）：可选——手构 ProbeSummary 的调用方/测试不传即视为无。
  // D4：与 sov 字段同一限定，同样只在 unbranded 子集计算。
  sovByEngine?: EngineSov[]
  // 分引擎可见度（G05/G06 分引擎报告，spec §7.3）：引擎间引用重叠仅 ~11-13.7%，不可互推，故不合并。
  // promptsPresent/promptsTotal 语义不变：全集口径（branded+unbranded 均计入）。
  // unbrandedPresent/unbrandedTotal（缺陷1修复，加法扩展）：同一引擎内限定在 unbranded 问题子集的
  // 问题级出现率，供 G06 门控消费——品牌题必然复述品牌名，混进全集会让门控值恒非零，规则结构性死亡。
  perEngine: { engine: string; promptsPresent: number; promptsTotal: number; samples: number; unbrandedPresent: number; unbrandedTotal: number }[]
  // 引用情感分布（G09）：仅统计含品牌样本；n=5 下方向性。
  sentiment: SentimentBreakdown
  // 代表性证据：优先第一条品牌命中的样本，点开可复核原文
  sampleEvidenceId: string | null
  // D4：unbranded 层头条指标——present/total 为 prompt 级口径（与 promptsPresent/promptsTotal 同尺度，
  // 但限定在 unbranded 问题子集），wilsonLow 是其 95% 置信区间下限，小样本时显著低于点估计，
  // 回测对比须两轮区间不重叠才可称「变化」（否则只能说「方向性波动，未超噪声」，inferred）。
  unbranded: { present: number; total: number; wilsonLow: number }
  // D3：branded 问题回答的认知质量三态，分引擎计数（含义见 BrandedEngineBreakdown 注释）。
  branded: { perEngine: BrandedEngineBreakdown[] }
  // D4：联网引擎的回答中 citedUrls 非空占比（0..1 原始比率，不取整）。其回测方差远大于 presence，
  // 阈值独立判断，不与 presence/SoV 共用同一套噪声纪律。
  citationRate: number
  // ⑤：被引用域名分布（域名→出现次数，标注 owned/third_party、平台分类），按次数降序。只统计
  // 正文真正引用的 citedUrls（不含 retrievedUrls——"仅被检索到"不是"被引用"，语义上不该混进
  // 这个分布）。全集口径（branded+unbranded 均计入），与既有 owned/third_party 归属口径一致。
  citedDomains: CitedDomainEntry[]
  // 社区/UGC 引用占比（新增）：cited 引用条数中落在社区/UGC 平台（reddit/quora/youtube/linkedin，
  // 见 citation-platform.ts 的 isUgcPlatform）的占比。口径：只统计 unbranded 问题子集下的
  // citedUrls（与 sov/sovByEngine 同一限定，见 D4 注释）——品牌题下模型倾向复述官方信息源，
  // 混入会稀释/扭曲"自然討論面引用"这个信号；分母是 unbranded 子集下全部 citedUrls 条数
  // （不含 retrievedUrls，与 citedDomains 同口径），为 0 时无法计算比例，返回 null（不是 0%，
  // 避免"无数据"被误读为"测得 0%"）。
  ugcCitationShare: number | null
}

export function aggregateProbeSummary(input: ProbeSummaryInput): ProbeSummary | null {
  const { prompts, results, brand, competitors, domain } = input
  if (results.length === 0) return null

  const ordered = [...prompts].sort((a, b) => a.priority - b.priority)
  // D1：branded 问题集合——缺省（旧调用方未标注）一律按 unbranded 处理，保证既有调用方行为不回归。
  const brandedPromptIds = new Set(ordered.filter((p) => p.branded === true).map((p) => p.id))
  const presentPromptIds = new Set(results.filter((r) => r.brandPresent).map((r) => r.promptId))
  const perPrompt = ordered.map((p) => {
    const samples = results.filter((r) => r.promptId === p.id)
    return {
      text: p.text,
      present: presentPromptIds.has(p.id),
      branded: p.branded === true,
      answers: samples.map((r) => ({
        provider: r.provider,
        answerText: r.answerText,
        evidenceId: r.evidenceId,
        present: r.brandPresent,
      })),
    }
  })

  // 每结果的竞品集：带原文 → 对当前 competitors 重解析（解冻探针期匹配，SP-A2 #6）；
  // 无原文 → 回退冻结的 competitorsMentioned（旧调用方不回归）。品牌/情感口径不受影响。
  const compsOf = (r: ProbeSummaryInput['results'][number]): string[] =>
    r.answerText != null ? competitorsInText(r.answerText, competitors) : r.competitorsMentioned

  // 给定样本子集算一份 SoV（品牌 + 各竞品出现占比），供全站与分引擎复用。
  const sovOver = (rows: ProbeSummaryInput['results']): SovEntry[] => {
    const n = rows.length
    if (n === 0) return []
    const pct = (count: number) => Math.round((count / n) * 100)
    return [
      { name: brand, pct: pct(rows.filter((r) => r.brandPresent).length), you: true },
      ...competitors.map((c) => ({
        name: c,
        pct: pct(rows.filter((r) => compsOf(r).includes(c)).length),
        you: false,
      })),
    ].sort((a, b) => b.pct - a.pct)
  }

  const total = results.length

  // —— D4：unbranded 层（头条）+ Wilson 95% 下限 ——：问题级口径，与 promptsPresent/promptsTotal 同尺度。
  const unbrandedPrompts = ordered.filter((p) => !brandedPromptIds.has(p.id))
  const unbrandedPromptIdSet = new Set(unbrandedPrompts.map((p) => p.id))
  const unbrandedTotal = unbrandedPrompts.length
  const unbrandedPresent = unbrandedPrompts.filter((p) => presentPromptIds.has(p.id)).length
  const unbranded = {
    present: unbrandedPresent,
    total: unbrandedTotal,
    wilsonLow: wilsonLowerBound(unbrandedPresent, unbrandedTotal),
  }

  // —— D4：SoV 只在 unbranded 子集计算 ——（sov 与 sovByEngine 同一限定，语义统一）。
  const unbrandedResults = results.filter((r) => unbrandedPromptIdSet.has(r.promptId))
  const sov = sovOver(unbrandedResults)

  // —— 分引擎聚合（G05/G06 分引擎报告）——：按 provider 分组，各自算 prompt 级出现率。
  // present/total 全集口径，语义不变；unbrandedPresent/unbrandedTotal 额外限定在 unbranded 子集
  // （复用上面已算好的 unbrandedPromptIdSet），供 G06 门控用（缺陷1修复）。
  const byEngine = new Map<
    string,
    { present: Set<string>; total: Set<string>; samples: number; unbrandedPresent: Set<string>; unbrandedTotal: Set<string> }
  >()
  for (const r of results) {
    const engine = r.provider ?? 'unknown'
    const bucket =
      byEngine.get(engine) ??
      { present: new Set<string>(), total: new Set<string>(), samples: 0, unbrandedPresent: new Set<string>(), unbrandedTotal: new Set<string>() }
    bucket.total.add(r.promptId)
    if (r.brandPresent) bucket.present.add(r.promptId)
    bucket.samples += 1
    if (unbrandedPromptIdSet.has(r.promptId)) {
      bucket.unbrandedTotal.add(r.promptId)
      if (r.brandPresent) bucket.unbrandedPresent.add(r.promptId)
    }
    byEngine.set(engine, bucket)
  }
  const perEngine = [...byEngine.entries()]
    .map(([engine, b]) => ({
      engine,
      promptsPresent: b.present.size,
      promptsTotal: b.total.size,
      samples: b.samples,
      unbrandedPresent: b.unbrandedPresent.size,
      unbrandedTotal: b.unbrandedTotal.size,
    }))
    .sort((a, b) => b.promptsPresent - a.promptsPresent || a.engine.localeCompare(b.engine))

  // —— 分引擎 SoV（SP-A2 #6 + D4）——：各引擎独立算一份 SoV，且限定在 unbranded 子集（同 sov 字段）。
  const engineRows = new Map<string, ProbeSummaryInput['results']>()
  for (const r of unbrandedResults) {
    const engine = r.provider ?? 'unknown'
    const bucket = engineRows.get(engine) ?? []
    bucket.push(r)
    engineRows.set(engine, bucket)
  }
  const sovByEngine: EngineSov[] = [...engineRows.entries()]
    .map(([engine, rows]) => ({ engine, samples: rows.length, sov: sovOver(rows) }))
    .sort((a, b) => b.samples - a.samples || a.engine.localeCompare(b.engine))

  // —— 情感分布（G09）——：仅对含品牌样本计数；未知/缺失归 neutral。全集口径，语义不变。
  const brandSamples = results.filter((r) => r.brandPresent)
  const sentiment: SentimentBreakdown = { positive: 0, neutral: 0, negative: 0, comparison: 0, total: brandSamples.length }
  for (const r of brandSamples) {
    const s = r.sentiment
    if (s === 'positive') sentiment.positive += 1
    else if (s === 'negative') sentiment.negative += 1
    else if (s === 'comparison') sentiment.comparison += 1
    else sentiment.neutral += 1
  }

  // —— D3：branded 层三态判定，分引擎计数 ——
  const brandedResults = results.filter((r) => brandedPromptIds.has(r.promptId))
  const engineBuckets = new Map<string, BrandedEngineBreakdown>()
  for (const r of brandedResults) {
    const provider = r.provider ?? 'unknown'
    const webSearchEnabled = resolveWebSearchEnabled(provider, r.webSearchEnabled)
    const bucket =
      engineBuckets.get(provider) ??
      { provider, webSearchEnabled, grounded: 0, speculative: 0, unknown: 0, unverified: 0, undetermined: 0 }
    // 判定逻辑收口到 engine-capability.ts 的 classifyBrandedAnswer（判定顺序即优先级，见 spec D3）。
    const state = classifyBrandedAnswer({
      provider,
      webSearchEnabled: r.webSearchEnabled,
      citedUrls: r.citedUrls,
      hedged: r.hedged,
      unknownAdmission: r.unknownAdmission,
    })
    bucket[state] += 1
    engineBuckets.set(provider, bucket)
  }
  const brandedBreakdown = {
    perEngine: [...engineBuckets.values()].sort((a, b) => a.provider.localeCompare(b.provider)),
  }

  // —— D4：citationRate——联网引擎回答里 citedUrls 非空的占比。样本方差远大于 presence，独立成指标。
  const onlineResults = results.filter((r) => resolveWebSearchEnabled(r.provider, r.webSearchEnabled))
  const citationRate =
    onlineResults.length === 0 ? 0 : onlineResults.filter((r) => (r.citedUrls ?? []).length > 0).length / onlineResults.length

  // —— ⑤：被引用域名分布——对全部样本的 citedUrls（只认正文引用，不含 retrievedUrls）按归一化
  // 域名（去 www、小写）计数，畸形 URL 忽略（不产出无证据的域名条目）。origin 用原始 URL 经
  // classifyCitationOrigin 判定（复用 citation-origin.ts 唯一实现，不重复一套匹配逻辑）；
  // domain 未传时无法验证"自有"，全部保守归为 third_party（见 ProbeSummaryInput.domain 注释）。
  const domainCounts = new Map<string, { count: number; origin: 'owned' | 'third_party'; platform: CitationPlatform }>()
  for (const r of results) {
    for (const u of r.citedUrls ?? []) {
      let host: string
      try {
        host = new URL(u).hostname.replace(/^www\./, '').toLowerCase()
      } catch {
        continue // 畸形 URL：忽略，不计入分布
      }
      const origin = domain ? classifyCitationOrigin(u, domain) : 'third_party'
      const platform = classifyCitationPlatform(host)
      const bucket = domainCounts.get(host) ?? { count: 0, origin, platform }
      bucket.count += 1
      domainCounts.set(host, bucket)
    }
  }
  const citedDomains: CitedDomainEntry[] = [...domainCounts.entries()]
    .map(([d, b]) => ({ domain: d, count: b.count, origin: b.origin, platform: b.platform }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))

  // —— 社区/UGC 引用占比（新增）——：限定 unbranded 子集（复用上面已算好的 unbrandedResults，
  // 与 sov/sovByEngine 同一限定），只认 citedUrls（不含 retrievedUrls），畸形 URL 与 citedDomains
  // 循环同规则忽略、不计入分母（见字段注释）。
  let unbrandedCitedTotal = 0
  let unbrandedUgcCitedCount = 0
  for (const r of unbrandedResults) {
    for (const u of r.citedUrls ?? []) {
      let host: string
      try {
        host = new URL(u).hostname.replace(/^www\./, '').toLowerCase()
      } catch {
        continue // 畸形 URL：忽略，不计入分子分母
      }
      unbrandedCitedTotal += 1
      if (isUgcPlatform(classifyCitationPlatform(host))) unbrandedUgcCitedCount += 1
    }
  }
  const ugcCitationShare = unbrandedCitedTotal === 0 ? null : unbrandedUgcCitedCount / unbrandedCitedTotal

  return {
    promptsTotal: ordered.length,
    promptsPresent: perPrompt.filter((p) => p.present).length,
    totalSamples: total,
    perPrompt,
    sov,
    sovByEngine,
    perEngine,
    sentiment,
    sampleEvidenceId: results.find((r) => r.brandPresent)?.evidenceId ?? results[0]?.evidenceId ?? null,
    unbranded,
    branded: brandedBreakdown,
    citationRate,
    citedDomains,
    ugcCitationShare,
  }
}
