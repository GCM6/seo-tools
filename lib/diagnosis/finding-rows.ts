import type { ClaimType } from '@/lib/types'
import { severityToFinding, type RuleHit, type Pillar } from './types'
import type { ValidationSpec } from './validation-spec'

// findings / recommendations 落库行的共享构造器。generate-findings（首轮）与
// reevaluate-competitors（竞品确认后增量）两处同源使用，保证两条链落库形状一致。

// 建议模板产物：只写业务字段（what/why/…），编排层补 id/runId/findingId/status/evidenceRefs。
// 字段与 recommendations 表列一一对应；由 '@/lib/diagnosis/recommend' 产出。
export interface RecommendationDraft {
  what: string
  why?: string
  expectedImpact?: string
  effort?: string
  risk?: string
  validationMethod?: string
  priority?: string
  confidence?: string
  // 结构化验证口径（spec §5.1-2）：outcome 自动判定唯一输入；非空才可进入 verifying。
  validationSpec?: ValidationSpec
}

// claim_type → UI 置信标签。铁律：「实测」仅限 L3/L4（measured_*）；推断/假设不得冒用。
export function confidenceLabel(claimType: ClaimType): string {
  switch (claimType) {
    case 'measured_hard':
      return '实测'
    case 'measured_sample':
      return '实测·样本'
    case 'inferred':
      return '推断'
    default:
      return '假设'
  }
}

export interface FindingRow {
  id: string
  runId: string
  side: RuleHit['side']
  // 支柱归属，健康分按此分组（spec §7.1）。
  pillar: Pillar
  title: string
  description: string
  severity: ReturnType<typeof severityToFinding>
  claimType: ClaimType
  confidence: string
  evidenceRefs: string[]
  fingerprint: string
  status: 'open'
}

// hits → finding 行。id 在此生成（调用方须裹进 step 保重试幂等）。
export function buildFindingRows(runId: string, hits: RuleHit[]): FindingRow[] {
  return hits.map((hit) => ({
    id: `find_${crypto.randomUUID()}`,
    runId,
    side: hit.side,
    pillar: hit.pillar,
    title: hit.title,
    description: hit.description,
    severity: severityToFinding(hit.severity),
    claimType: hit.claimType,
    confidence: confidenceLabel(hit.claimType),
    evidenceRefs: hit.evidenceRefs,
    // 跨 run 身份锚：retest delta 按 fingerprint 对齐 resolved/persistent/new/regressed。
    fingerprint: hit.fingerprint,
    status: 'open' as const,
  }))
}

export interface RecommendationRow {
  id: string
  runId: string
  findingId: string
  what: string
  why: string
  expectedImpact: string
  effort: string
  risk: string
  validationMethod: string
  priority: string
  confidence: string
  status: 'draft'
  evidenceRefs: string[]
  validationSpec: ValidationSpec | null
}

// hits + 对应 findingRows → recommendation 行。按下标与 hits/findingRows 对齐（同源 map，顺序稳定）。
export async function buildRecommendationRows(
  runId: string,
  hits: RuleHit[],
  findingRows: FindingRow[],
  generateRecommendation: (hit: RuleHit, opts: { domain: string }) => Promise<RecommendationDraft> | RecommendationDraft,
  domain: string,
): Promise<RecommendationRow[]> {
  return Promise.all(
    hits.map(async (hit, i) => {
      const draft = await generateRecommendation(hit, { domain })
      return {
        id: `rec_${crypto.randomUUID()}`,
        runId,
        findingId: findingRows[i].id,
        what: draft.what,
        why: draft.why ?? '',
        expectedImpact: draft.expectedImpact ?? '',
        effort: draft.effort ?? '',
        risk: draft.risk ?? '',
        validationMethod: draft.validationMethod ?? '',
        priority: draft.priority ?? 'P2',
        confidence: draft.confidence ?? confidenceLabel(hit.claimType),
        status: 'draft' as const,
        evidenceRefs: hit.evidenceRefs,
        validationSpec: draft.validationSpec ?? null,
      }
    }),
  )
}
