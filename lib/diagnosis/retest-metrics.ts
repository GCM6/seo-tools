import type { ValidationSpec } from './validation-spec'
import type { MetricPair, RetestSnapshotRow } from './retest-delta'
import type { ProbeSummary } from '@/lib/probes/summary'
import type { AioExposureSummary } from '@/lib/serp/aio-summary'
import { wilsonLowerBound } from '@/lib/stats/wilson'

// 回测标量聚合目标（spec §5.1）：GSC 类 finding 存其关键词集，retest 据此精确取 impressions。
export interface MetricTarget {
  keywords: string[]
}

// 一轮 run 的可比标量来源（回测执行器为 baseline/retest 各构建一份）。
export interface RunMetrics {
  probe: ProbeSummary | null
  gscKeywords: { keyText: string; impressions: number; position: number }[]
  // 缺陷1 守卫所需信号 A：该轮 prompts 中 branded=true 的行数。
  // migration 0008 给存量 prompts.branded 一律默认 false 且不回填；若基线轮此值恒为 0
  // 而对比轮 >0，基线大概率是迁移前旧数据（unbranded 分母混入品牌复述题），与本轮口径不可比。
  brandedPromptCount: number
  // 缺陷1 守卫所需信号 B：该轮 ai_probe_results.parser_version 去重集合（当前 v4）。
  // 两轮解析器版本不一致，说明分类规则本身变了，同样不可比。
  parserVersions: string[]
  // GEO 新口径回测扩展：Google AI Overview 实测曝光聚合（lib/serp/aio-summary.ts）。
  // 旧 run 未采集（未配置 DataForSEO / run 早于该能力落地）→ null，代表「无数据」，
  // 不得折算为 0 参与 delta（与 probe 字段为 null 时的既有约定一致）。
  aio: AioExposureSummary | null
}

// 口径可比性判定结果（缺陷1 守卫，纯函数、可单测）。
export interface ComparabilityCheck {
  comparable: boolean
}

// 判定两轮 unbranded 口径是否可比（spec D4；migration 0008 背景见 RunMetrics 字段注释）。
// 命中任一信号 → 不可比；调用方（buildProbeMetricRows）据此短路，不呈现涨跌措辞。
export function checkUnbrandedComparability(baseline: RunMetrics, retest: RunMetrics): ComparabilityCheck {
  // 信号 A：基线全部 unbranded（未分类），对比轮已正确标注 branded。
  if (baseline.brandedPromptCount === 0 && retest.brandedPromptCount > 0) {
    return { comparable: false }
  }
  // 信号 B：两轮探针解析器版本集合不一致。
  const baseVersions = [...new Set(baseline.parserVersions)].sort()
  const retestVersions = [...new Set(retest.parserVersions)].sort()
  if (baseVersions.length > 0 && retestVersions.length > 0 && baseVersions.join(',') !== retestVersions.join(',')) {
    return { comparable: false }
  }
  return { comparable: true }
}

// Wilson 95% 区间上下限。wilson.ts 只共享下限公式；上限用恒等式 upper(p) = 1 - lower(1-p) 反推
// （同一 margin，对称推导），避免在别处重新实现一套上限公式（该文件不得改 lib/stats/wilson.ts）。
function wilsonInterval(successes: number, total: number): [number, number] {
  if (total <= 0) return [0, 0]
  const lower = wilsonLowerBound(successes, total)
  const upper = 1 - wilsonLowerBound(total - successes, total)
  return [lower, upper]
}

// 关键词归一：trim + 小写。
const normKw = (s: string): string => s.trim().toLowerCase()

// 从 hit.detail 抽 GSC 聚合关键词集：detail.keywords[].text 或 detail.queries[].query。
// 抽不到（无 detail / 非关键词类 / 空集）→ null。
export function extractMetricTarget(detail?: Record<string, unknown>): MetricTarget | null {
  if (!detail) return null
  const pick = (arr: unknown, field: string): string[] =>
    Array.isArray(arr)
      ? (arr as unknown[])
          .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[field] : undefined))
          .filter((v): v is string => typeof v === 'string')
      : []
  const keywords = [...pick(detail.keywords, 'text'), ...pick(detail.queries, 'query')]
  return keywords.length > 0 ? { keywords } : null
}

// 按 validation_spec（GSC 另需 finding 目标）从一轮取标量；取不到 → null。
export function extractRunMetric(spec: ValidationSpec, run: RunMetrics, target: MetricTarget | null): number | null {
  if (spec.metricSource === 'probe') {
    if (!run.probe) return null
    if (spec.metric === 'brand_sov') {
      // D5：sov 沿用 probe.sov——该字段本身已在聚合层（lib/probes/summary.ts D4）限定在 unbranded
      // 子集计算（branded 问题里模型必然复述品牌名，混进 SoV 会失真），无需在这里再收窄。
      const you = run.probe.sov.find((s) => s.you)
      return you ? you.pct : null
    }
    if (spec.metric === 'brand_presence') {
      // D5：从全集口径 promptsPresent/promptsTotal 切到 unbranded 层——brand_presence 要衡量的是
      // 「AI 在无提示情况下主动召回品牌」，branded 问题里模型复述问题文本自带的品牌名不是真实信号。
      const { unbranded } = run.probe
      return unbranded.total > 0 ? unbranded.present / unbranded.total : null
    }
    return null
  }
  if (spec.metricSource === 'gsc' && (spec.metric === 'impressions' || spec.metric === 'position')) {
    if (!target || target.keywords.length === 0) return null
    const wanted = new Set(target.keywords.map(normKw))
    const matched = run.gscKeywords.filter((k) => wanted.has(normKw(k.keyText)))
    if (matched.length === 0) return null
    // impressions 求和；position 取平均（位次类 K02/K06，direction=decrease，均值即方向性够用）。
    return spec.metric === 'position'
      ? matched.reduce((sum, k) => sum + k.position, 0) / matched.length
      : matched.reduce((sum, k) => sum + k.impressions, 0)
  }
  return null
}

// 两轮 → MetricPair；两侧都取到才可比，任一 null → null（回退四态）。
export function buildMetricPair(
  spec: ValidationSpec,
  target: MetricTarget | null,
  baseline: RunMetrics,
  retest: RunMetrics,
): MetricPair | null {
  const b = extractRunMetric(spec, baseline, target)
  const r = extractRunMetric(spec, retest, target)
  if (b === null || r === null) return null
  return { baseline: b, retest: r }
}

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

// 缺陷1：口径不可比时的固定措辞——不给涨跌结论，指引回填后重测。
const INCOMPARABLE_INTERPRETATION = '基线数据未按当前口径分类（需运行 pnpm reparse-probes 回填后重测），本轮不给出变化结论'

// 缺陷2（spec D4）：unbranded 比例类指标重叠时的固定措辞——方向性波动未超噪声，不升级为「上升/下降」。
const NOISE_INTERPRETATION = '方向性波动，未超噪声（推断，n=5 方向性）'

// GEO 新口径扩展（cited_owned_share / aio.*）：兼容策略——旧 run 缺该维度数据时只展示已有一侧的
// 数值，不给涨跌结论，绝不把缺失侧折算为 0 参与 delta（编排者裁决，见 spec 回测兼容性说明）。
const ONE_SIDED_NO_DATA_INTERPRETATION = '该指标仅一轮采集到数据（另一轮无该维度证据，需重新诊断/采集后再回测），本轮不给出变化结论'

// 通用「比例类指标」两轮行构造，供 probe.cited_owned_share / aio.* 复用（不复用于既有
// brand_sov/brand_presence——那两行有各自的 Wilson 噪声门与口径守卫，保持原样不改）。
// 三态兼容：
//   两侧都有数据 → 正常涨跌，interpretation 由调用方 describe(deltaPct) 生成；
//   仅一侧有数据 → 只展示已知侧数值，delta 固定 '—'，不产出涨跌结论；
//   两侧都无数据 → 返回 null，调用方据此不产出该行（旧 run 完全缺该维度证据时静默跳过）。
function buildRatioRow(
  metricName: string,
  b: number | null,
  r: number | null,
  describe: (deltaPct: number) => string,
): RetestSnapshotRow | null {
  if (b === null && r === null) return null
  const fmtPct = (v: number) => `${Math.round(v * 100)}%`
  if (b === null || r === null) {
    return {
      metricName,
      baselineValue: b !== null ? fmtPct(b) : '—',
      retestValue: r !== null ? fmtPct(r) : '—',
      delta: '—',
      interpretation: ONE_SIDED_NO_DATA_INTERPRETATION,
    }
  }
  const bPct = Math.round(b * 100)
  const rPct = Math.round(r * 100)
  const d = rPct - bPct
  return { metricName, baselineValue: `${bPct}%`, retestValue: `${rPct}%`, delta: signed(d), interpretation: describe(d) }
}

// ⑤：被引用域名中「自有站点」占全部被引次数的比例——owned 次数 / 全部 citedDomains 次数之和。
// citedDomains 统计的是全部样本（不限定 unbranded 子集，见 lib/probes/summary.ts 字段注释），
// 不受 checkUnbrandedComparability 的 branded/unbranded 口径守卫约束。
// total===0（citedDomains 为空/全零）视为「无数据」而非「measured 0%」——旧 run 若从未采集
// citedUrls（探针协议早于该字段落地）与「真实测得零引用」在这层数据上无法区分，保守判 null，
// 避免把结构性缺数据误报成一个可信的 0% 数字（不产出无证据结论）。
function citedOwnedShare(p: ProbeSummary | null): number | null {
  const domains = p?.citedDomains ?? []
  const total = domains.reduce((s, d) => s + d.count, 0)
  if (total === 0) return null
  const owned = domains.filter((d) => d.origin === 'owned').reduce((s, d) => s + d.count, 0)
  return owned / total
}

// Google AI Overview 曝光率：出现 AIO 的查询数 / 实际测得响应的查询数。measuredQueries===0
// （未配置 DataForSEO / 本轮未采集）→ null，与 CitedDomainsCard/AioExposureCard 的空态语义一致。
function aioPresentRate(a: AioExposureSummary | null): number | null {
  if (!a || a.measuredQueries === 0) return null
  return a.aioPresentCount / a.measuredQueries
}

// AIO 引用中自有站点占比：ownedCitedCount / aioPresentCount（与 AioExposureCard 的展示口径
// 一致——"owned / of aioPresentCount"，而非 / measuredQueries）。aioPresentCount===0 时该比例
// 无意义（分母为 0，不是"真实测得 0%"），判 null。
function aioOwnedCitedRate(a: AioExposureSummary | null): number | null {
  if (!a || a.aioPresentCount === 0) return null
  return a.ownedCitedCount / a.aioPresentCount
}

// probe 品牌指标两轮对比 → 快照行（报告 §8 展示）。任一轮无 probe → 空。
export function buildProbeMetricRows(baseline: RunMetrics, retest: RunMetrics): RetestSnapshotRow[] {
  const bp = baseline.probe
  const rp = retest.probe
  if (!bp || !rp) return []
  const rows: RetestSnapshotRow[] = []

  // D5：brand_sov 沿用 probe.sov——聚合层（D4）已限定在 unbranded 子集计算，这里无需再收窄。
  const bSov = bp.sov.find((s) => s.you)?.pct ?? null
  const rSov = rp.sov.find((s) => s.you)?.pct ?? null
  // D5：brand_presence 改用 unbranded 层 present/total（无品牌提问中 AI 主动召回品牌的占比），
  // 不再用 branded+unbranded 混合的 promptsPresent/promptsTotal。
  const bPres = bp.unbranded.total > 0 ? Math.round((bp.unbranded.present / bp.unbranded.total) * 100) : null
  const rPres = rp.unbranded.total > 0 ? Math.round((rp.unbranded.present / rp.unbranded.total) * 100) : null

  // 缺陷1 守卫：优先级最高，命中即短路——两个 unbranded 口径的指标行都只报告数值，不给涨跌结论。
  // 注意：只短路 sov/presence 两行（都限定在 unbranded 子集，受 branded 回填状态影响），
  // 不再 early return——citedDomains 口径的 cited_owned_share 不受该守卫约束（见其函数注释），
  // 必须在两个分支之外都能落地。
  const comparability = checkUnbrandedComparability(baseline, retest)
  if (!comparability.comparable) {
    if (bSov !== null && rSov !== null) {
      rows.push({
        metricName: 'probe.brand_sov',
        baselineValue: `${bSov}%`,
        retestValue: `${rSov}%`,
        delta: '—',
        interpretation: INCOMPARABLE_INTERPRETATION,
      })
    }
    if (bPres !== null && rPres !== null) {
      rows.push({
        metricName: 'probe.brand_presence',
        baselineValue: `${bPres}%`,
        retestValue: `${rPres}%`,
        delta: '—',
        interpretation: INCOMPARABLE_INTERPRETATION,
      })
    }
  } else {
    if (bSov !== null && rSov !== null) {
      const d = Math.round((rSov - bSov) * 10) / 10
      rows.push({
        metricName: 'probe.brand_sov',
        baselineValue: `${bSov}%`,
        retestValue: `${rSov}%`,
        delta: signed(d),
        interpretation: d > 0 ? '品牌 AI 答案占有率上升（推断，n=5 方向性）' : d < 0 ? '品牌 AI 答案占有率下降（推断）' : '品牌 AI 答案占有率持平（推断）',
      })
    }

    if (bPres !== null && rPres !== null) {
      const d = rPres - bPres
      // 缺陷2（spec D4）：unbranded 比例类指标——两轮 Wilson 95% 区间不重叠才可表述「上升/下降」，
      // 否则只能说「方向性波动，未超噪声」（inferred）。delta 数值保留，仅措辞降级。
      const [bLow, bHigh] = wilsonInterval(bp.unbranded.present, bp.unbranded.total)
      const [rLow, rHigh] = wilsonInterval(rp.unbranded.present, rp.unbranded.total)
      const overlapping = !(bHigh < rLow || rHigh < bLow)
      rows.push({
        metricName: 'probe.brand_presence',
        baselineValue: `${bPres}%`,
        retestValue: `${rPres}%`,
        delta: signed(d),
        interpretation: overlapping
          ? NOISE_INTERPRETATION
          : d > 0
            ? '品牌在 AI 回答中出现率上升（推断，n=5 方向性）'
            : d < 0
              ? '品牌在 AI 回答中出现率下降（推断）'
              : '品牌出现率持平（推断）',
      })
    }
  }

  // GEO 新口径扩展：被引用域名中自有站点占比（citedDomains owned/全部）——不受上面 unbranded
  // 口径守卫约束，兼容三态（两侧有数据/仅一侧/都无）由 buildRatioRow 统一处理。
  const ownedRow = buildRatioRow(
    'probe.cited_owned_share',
    citedOwnedShare(bp),
    citedOwnedShare(rp),
    (d) =>
      d > 0
        ? '被引用域名中自有站点占比上升（推断，n=5 方向性）'
        : d < 0
          ? '被引用域名中自有站点占比下降（推断）'
          : '被引用域名中自有站点占比持平（推断）',
  )
  if (ownedRow) rows.push(ownedRow)

  return rows
}

// Google AI Overview 实测曝光两轮对比 → 快照行（spec：全产品唯一允许「实测」字样的曝光口径，
// 与 probe 系推断指标区分措辞）。两行均走 buildRatioRow 的三态兼容：任一轮 aio 为 null 或
// measuredQueries===0（未配置/未采集）时按无数据处理，不折算为 0 参与 delta。
export function buildAioMetricRows(baseline: RunMetrics, retest: RunMetrics): RetestSnapshotRow[] {
  const rows: RetestSnapshotRow[] = []

  const presentRow = buildRatioRow(
    'aio.present_rate',
    aioPresentRate(baseline.aio),
    aioPresentRate(retest.aio),
    (d) =>
      d > 0
        ? 'Google AI Overview 曝光率上升（实测，单轮采样）'
        : d < 0
          ? 'Google AI Overview 曝光率下降（实测，单轮采样）'
          : 'Google AI Overview 曝光率持平（实测，单轮采样）',
  )
  if (presentRow) rows.push(presentRow)

  const ownedRow = buildRatioRow(
    'aio.owned_cited_rate',
    aioOwnedCitedRate(baseline.aio),
    aioOwnedCitedRate(retest.aio),
    (d) =>
      d > 0
        ? 'AI Overview 引用中自有站点占比上升（实测，单轮采样）'
        : d < 0
          ? 'AI Overview 引用中自有站点占比下降（实测，单轮采样）'
          : 'AI Overview 引用中自有站点占比持平（实测，单轮采样）',
  )
  if (ownedRow) rows.push(ownedRow)

  return rows
}
