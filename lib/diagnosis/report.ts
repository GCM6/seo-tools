import type { Pillar, FindingSeverity } from './types'
import { computeHealthScore, type HealthScoreResult } from './health-score'
import { checkArtifactFreshness, type ReferenceArtifactRow, type FreshnessReport } from './reference-artifacts'

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

export interface BuildReportInput {
  findings: ReportFinding[]
  recommendations: ReportRecommendation[]
  // 采集到数据源的支柱（page 据 evidence 类型判定）；缺省=findings 里出现过的支柱。
  pillarsWithData?: Pillar[]
  // 规则保鲜资产行（§11.1）；缺省无陈旧告警。
  artifacts?: ReferenceArtifactRow[]
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

  return {
    execSummary: { health, constraint, topFindings },
    pillarGroups,
    priorityMatrix,
    roadmap,
    freshness,
    counts: {
      findings: active.length,
      dismissed: input.findings.length - active.length,
      recommendations: input.recommendations.length,
      gated: input.recommendations.filter((r) => GATED.has(r.status)).length,
    },
  }
}
