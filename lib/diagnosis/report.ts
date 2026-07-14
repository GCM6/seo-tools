import type { Pillar, FindingSeverity } from './types'
import { computeHealthScore, type HealthScoreResult } from './health-score'
import { checkArtifactFreshness, type ReferenceArtifactRow, type FreshnessReport } from './reference-artifacts'
import type { DataSourceStatus } from '@/db/schema'

// 综合报告聚合（spec §7.2）——纯逻辑，report 页只渲染本模块产物。无 I/O、可单测。
// 恒守铁律：健康分/约束定位/流量价值均标「推断」，不冒用「实测」。

const PILLARS: Pillar[] = ['P1', 'P2', 'P3', 'P4', 'P5']
const SEV_WEIGHT: Record<FindingSeverity, number> = { high: 3, mid: 1, ok: 0.25 }

// —— 报告输入（结构化，接受 DB 行的宽松形状）——
export interface ReportFinding {
  id: string
  side: string
  pillar: string | null
  title: string
  description: string
  severity: FindingSeverity
  claimType: string
  confidence: string
  evidenceRefs: string[]
  status: string
}

export interface ReportRecommendation {
  id: string
  findingId: string
  what: string
  why: string
  expectedImpact: string
  effort: string
  priority: string // quick_win | strategic | fill_in | low
  confidence: string
  status: string
  outcome: string
  validationMethod: string
}

// —— 诊断范围（报告合同 §3.1 必含字段）——
export interface ReportScope {
  domain: string
  entryUrl: string
  targetMarket?: string
  language?: string
  device?: string
  capturedAt: string
  crawlMaxPages?: number
  crawlMaxDepth?: number
  keyPageCount?: number
}

// —— 数据源覆盖度（报告合同 §3.1）——
export interface DataSourceCoverage {
  sourceKey: string
  configured: boolean
  authorized: boolean
  attempted: boolean
  status: DataSourceStatus
  failureReason?: string | null
  capturedEvidenceCount: number
  protocolSnapshot?: unknown
}

// —— 报告合同（报告合同 §3.1-3.2）——
export type ReportLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5'

export interface ReportContract {
  scope: ReportScope
  dataSources: DataSourceCoverage[]
  // 覆盖度统计
  coverage: {
    totalDiscovered: number
    checkedPages: number
    truncated: boolean
    gscTimeWindow?: string
    aiValidSamples?: number
    confirmedCompetitors?: number
  }
  // 报告等级：基于前置条件自动判定
  level: ReportLevel
  // 缺失数据源列表（未配置或失败的 sourceKey）
  gaps: string[]
  // 排除项说明
  exclusions: string[]
}

export interface ReportEvidenceLike {
  type: string
  source?: string
  payload: unknown
}

export interface ReportContractContext {
  domain: string
  targetMarket?: string
  language?: string
  capturedAt: string
  evidence: ReportEvidenceLike[]
  dataSources: DataSourceCoverage[]
  aiValidSamples: number
  confirmedCompetitors: number
}

export interface BuildReportInput {
  findings: ReportFinding[]
  recommendations: ReportRecommendation[]
  // 采集到数据源的支柱（page 据 evidence 类型判定）；缺省=findings 里出现过的支柱。
  pillarsWithData?: Pillar[]
  // 规则保鲜资产行（§11.1）；缺省无陈旧告警。
  artifacts?: ReferenceArtifactRow[]
  // 报告合同：诊断范围与数据源覆盖度（§3.1）
  scope?: ReportScope
  dataSources?: DataSourceCoverage[]
  // 覆盖度原始统计
  coverageStats?: {
    totalDiscovered?: number
    checkedPages?: number
    truncated?: boolean
    gscTimeWindow?: string
    aiValidSamples?: number
    confirmedCompetitors?: number
  }
  now: Date
}

// —— 约束定位卡（§7.2 板块1 决策树，标「推断」）——
export type ConstraintKind = 'systemic_basics' | 'visibility_data_missing' | 'authority_content' | 'fine_tuning'
export interface ConstraintLocator {
  kind: ConstraintKind
  // 主约束一句话 + 分诊指向的支柱/动作。文案 key，page 用 i18n 渲染。
  focusPillars: Pillar[]
}

const isActive = (f: ReportFinding): boolean => f.status !== 'dismissed'
const validPillar = (p: string | null): p is Pillar => !!p && (PILLARS as string[]).includes(p)

function locateConstraint(findings: ReportFinding[], pillarsWithData: Pillar[]): ConstraintLocator {
  const active = findings.filter(isActive)
  const has = (p: Pillar, sev: FindingSeverity) => active.some((f) => f.pillar === p && f.severity === sev)
  const countIn = (ps: Pillar[]) => active.filter((f) => validPillar(f.pillar) && ps.includes(f.pillar)).length

  // ① P1 有 error 级抓取/索引/渲染断裂 → 系统性基础问题，先看 P1。
  if (has('P1', 'high')) return { kind: 'systemic_basics', focusPillars: ['P1'] }
  // ② 关键词现状空/极稀疏（P3 无数据）→ 可见性数据不足，引导接 GSC/配 DataForSEO。
  if (!pillarsWithData.includes('P3')) return { kind: 'visibility_data_missing', focusPillars: ['P3'] }
  // ③ 大量缺口（P3）+ 权威/语料弱（P4/P5）→ 权威与内容竞争力不足，先看 P3+P5。
  if (countIn(['P3']) >= 3 && countIn(['P4', 'P5']) >= 2) return { kind: 'authority_content', focusPillars: ['P3', 'P5'] }
  // ④ 否则 → 精细优化阶段，按 impact 排序。
  return { kind: 'fine_tuning', focusPillars: [] }
}

// —— 执行摘要（§7.2 板块1）——
export interface ExecSummary {
  health: HealthScoreResult
  constraint: ConstraintLocator
  // 3 个最高影响发现（按 severity 权重排）。
  topFindings: ReportFinding[]
}

function rankByImpact(findings: ReportFinding[]): ReportFinding[] {
  return [...findings]
    .filter(isActive)
    .sort((a, b) => SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity])
}

// —— 五支柱明细分组（§7.2 板块3）——
export interface PillarGroup {
  pillar: Pillar
  scored: boolean
  score: number | null
  findings: ReportFinding[]
}

// —— 优先级矩阵（§7.2 板块6）——
export type Quadrant = 'quick_win' | 'strategic' | 'fill_in' | 'low'
export interface PriorityMatrix {
  quick_win: ReportRecommendation[]
  strategic: ReportRecommendation[]
  fill_in: ReportRecommendation[]
  low: ReportRecommendation[]
}

// —— 行动路线图（§7.2 板块7）——按建议 effort 档位分近/中/远期。
export type RoadmapHorizon = 'quick' | 'mid' | 'long'
export interface RoadmapItem {
  recommendation: ReportRecommendation
  horizon: RoadmapHorizon
}

// effort 标签（低/中/高）→ 路线图周期。仅接受人工闸门通过（accepted/edited）的建议进路线图。
function horizonFromEffort(effortLabel: string): RoadmapHorizon {
  if (effortLabel.includes('低')) return 'quick'
  if (effortLabel.includes('高')) return 'long'
  return 'mid'
}

export interface ReportModel {
  execSummary: ExecSummary
  pillarGroups: PillarGroup[]
  priorityMatrix: PriorityMatrix
  roadmap: RoadmapItem[]
  // 规则保鲜陈旧告警（§11.1）；无 artifacts 时 stale 为空。
  freshness: FreshnessReport
  // 报告合同（§3.1）：诊断范围、数据源覆盖度、报告等级和缺口
  reportContract: ReportContract | null
  // 计数便于面板 StatStrip / 报告头。
  counts: { findings: number; dismissed: number; recommendations: number; gated: number }
}

const GATED = new Set(['accepted', 'edited'])

export function buildReport(input: BuildReportInput): ReportModel {
  const active = input.findings.filter(isActive)
  const pillarsWithData =
    input.pillarsWithData ?? (PILLARS.filter((p) => active.some((f) => f.pillar === p)) as Pillar[])

  const health = computeHealthScore({
    findings: active.filter((f) => validPillar(f.pillar)).map((f) => ({ pillar: f.pillar as Pillar, severity: f.severity })),
    pillarsWithData,
  })

  const constraint = locateConstraint(input.findings, pillarsWithData)
  const topFindings = rankByImpact(input.findings).slice(0, 3)

  const pillarGroups: PillarGroup[] = PILLARS.map((p) => ({
    pillar: p,
    scored: pillarsWithData.includes(p),
    score: health.pillars[p].score,
    findings: active.filter((f) => f.pillar === p),
  }))

  const priorityMatrix: PriorityMatrix = { quick_win: [], strategic: [], fill_in: [], low: [] }
  for (const r of input.recommendations) {
    const q = (['quick_win', 'strategic', 'fill_in', 'low'] as Quadrant[]).includes(r.priority as Quadrant)
      ? (r.priority as Quadrant)
      : 'fill_in'
    priorityMatrix[q].push(r)
  }

  // 路线图只收人工闸门通过的建议（默认不把未接受项塞进路线图）。
  const roadmap: RoadmapItem[] = input.recommendations
    .filter((r) => GATED.has(r.status))
    .map((r) => ({ recommendation: r, horizon: horizonFromEffort(r.effort) }))

  const freshness = checkArtifactFreshness(input.artifacts ?? [], input.now)

  // 报告合同（§3.1）：从数据源覆盖度推导报告等级和缺口
  const reportContract = buildReportContract(input)

  return {
    execSummary: { health, constraint, topFindings },
    pillarGroups,
    priorityMatrix,
    roadmap,
    freshness,
    reportContract,
    counts: {
      findings: active.length,
      dismissed: input.findings.length - active.length,
      recommendations: input.recommendations.length,
      gated: input.recommendations.filter((r) => GATED.has(r.status)).length,
    },
  }
}

// —— 报告等级推导（§3.2）——
// R0 = 采集状态；R1 = 技术可发现性；R2 = +GSC；R3 = +竞品+关键词；R4 = +GEO；R5 = +GA4/CRM
function deriveReportLevel(sources: DataSourceCoverage[]): ReportLevel {
  const hasCollected = (key: string) => sources.some((s) => s.sourceKey === key && s.status === 'collected')
  const crawl = sources.find((s) => s.sourceKey === 'crawl')
  const hasCrawlCoverage = Boolean(crawl && (crawl.status === 'collected' || (crawl.status === 'partial' && crawl.capturedEvidenceCount > 0)))
  const gsc = hasCollected('gsc')
  const market = hasCollected('dataforseo')
  const ai = sources.find((s) => s.sourceKey === 'ai_probe')
  const aiSamples = (ai?.protocolSnapshot as { validSamples?: unknown } | null)?.validSamples
  const hasAiSamples = ai?.status === 'collected' && typeof aiSamples === 'number' && aiSamples > 0
  const confirmedCompetitors = (sources.find((s) => s.sourceKey === 'dataforseo')?.protocolSnapshot as { confirmedCompetitors?: unknown } | null)?.confirmedCompetitors
  const hasConfirmedCompetitors = typeof confirmedCompetitors === 'number' && confirmedCompetitors > 0

  // R3/R4 是完整市场/GEO 报告，不能因为某个 provider 的空壳状态升级。
  if (hasCrawlCoverage && gsc && market && hasConfirmedCompetitors && hasAiSamples) return 'R4'
  if (hasCrawlCoverage && gsc && market && hasConfirmedCompetitors) return 'R3'
  if (hasCrawlCoverage && gsc) return 'R2'
  if (hasCrawlCoverage) return 'R1'
  return 'R0'
}

function buildReportContract(input: BuildReportInput): ReportContract | null {
  if (!input.scope) return null

  const sources = input.dataSources ?? []
  const gaps = sources
    .filter((s) => s.status !== 'collected')
    .map((s) => s.sourceKey)

  const stats = input.coverageStats ?? {}

  return {
    scope: input.scope,
    dataSources: sources,
    coverage: {
      totalDiscovered: stats.totalDiscovered ?? 0,
      checkedPages: stats.checkedPages ?? 0,
      truncated: stats.truncated ?? false,
      gscTimeWindow: stats.gscTimeWindow,
      aiValidSamples: stats.aiValidSamples,
      confirmedCompetitors: stats.confirmedCompetitors,
    },
    level: deriveReportLevel(withCoverageProtocol(sources, stats)),
    gaps,
    exclusions: sources
      .filter((s) => s.status !== 'collected')
      .map((s) => `${s.sourceKey}:${s.status}`),
  }
}

function withCoverageProtocol(sources: DataSourceCoverage[], stats: NonNullable<BuildReportInput['coverageStats']>): DataSourceCoverage[] {
  return sources.map((source) => {
    if (source.sourceKey === 'ai_probe') {
      return {
        ...source,
        protocolSnapshot: {
          ...(asRecord(source.protocolSnapshot) ?? {}),
          validSamples: stats.aiValidSamples ?? 0,
        },
      }
    }
    if (source.sourceKey === 'dataforseo') {
      return {
        ...source,
        protocolSnapshot: {
          ...(asRecord(source.protocolSnapshot) ?? {}),
          confirmedCompetitors: stats.confirmedCompetitors ?? 0,
        },
      }
    }
    return source
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function gscWindow(sources: DataSourceCoverage[]): string | undefined {
  const snapshot = asRecord(sources.find((s) => s.sourceKey === 'gsc')?.protocolSnapshot)
  const range = asRecord(snapshot?.dateRange)
  const start = typeof range?.startDate === 'string' ? range.startDate : undefined
  const end = typeof range?.endDate === 'string' ? range.endDate : undefined
  return start && end ? `${start} – ${end}` : undefined
}

/**
 * 将本轮原始证据与状态行归一为 buildReport 所需的合同输入，供在线报告和 Markdown 导出复用。
 */
export function buildReportContractInput(context: ReportContractContext): Pick<BuildReportInput, 'scope' | 'dataSources' | 'coverageStats'> {
  const audit = context.evidence.find((e) => e.type === 'site_audit')
  const auditPayload = asRecord(audit?.payload)
  const auditStats = asRecord(auditPayload?.stats)
  const protocol = asRecord(auditPayload?.protocol)
  const dataSources = context.dataSources

  return {
    scope: {
      domain: context.domain,
      entryUrl: audit?.source || `https://${context.domain}`,
      targetMarket: context.targetMarket || undefined,
      language: context.language || undefined,
      capturedAt: context.capturedAt,
      crawlMaxPages: asNumber(protocol?.maxPages),
      crawlMaxDepth: asNumber(protocol?.maxDepth),
    },
    dataSources,
    coverageStats: {
      totalDiscovered: asNumber(auditStats?.totalDiscovered),
      checkedPages: asNumber(auditStats?.checked),
      truncated: (asNumber(auditStats?.truncated) ?? 0) > 0,
      gscTimeWindow: gscWindow(dataSources),
      aiValidSamples: context.aiValidSamples,
      confirmedCompetitors: context.confirmedCompetitors,
    },
  }
}
