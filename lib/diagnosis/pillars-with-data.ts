import type { Pillar } from './types'
import type { EvidenceType } from '@/lib/types'

// 「已采集到数据源的支柱」判定——单一真源（此前逐字重复在 app/api/runs/[id]/report/route.ts
// 与 components/ReportView.tsx 两处，本文件迁出后两处均改为 import）。
// 用途：health-score.ts 用它决定哪些支柱参与评分（不在其中 → 该支柱「未评分」，从 overall 加权
// 分母剔除，见 health-score.ts 顶部注释），报告页/Markdown 报告也用它决定哪些支柱区块可渲染分数。

const PILLARS: Pillar[] = ['P1', 'P2', 'P3', 'P4', 'P5']

// 证据类型 → 支柱。
const EVIDENCE_PILLAR: Partial<Record<EvidenceType, Pillar>> = {
  psi: 'P1',
  site_audit: 'P1',
  page_fetch: 'P1',
  schema: 'P2',
  render_check: 'P2',
  gsc: 'P3',
  dataforseo_labs: 'P3',
  dataforseo_serp: 'P4',
  ua_probe: 'P5',
  third_party_presence: 'P5',
  dataforseo_backlinks: 'P5',
}

/**
 * 判定本轮 run 实际「已评分」的支柱集合。
 *
 * @param evidenceTypes 本轮采集到的证据类型列表
 * @param findingPillars 本轮命中的 finding 所属支柱列表（findings 存在即说明该支柱有产出，纳入已评分集合）
 * @param confirmedCompetitorCount 已确认竞品数量（status=confirmed）——P4 专用闸门，见下方注释
 */
export function pillarsWithData(
  evidenceTypes: string[],
  findingPillars: (string | null)[],
  confirmedCompetitorCount: number,
): Pillar[] {
  const set = new Set<Pillar>()
  for (const t of evidenceTypes) {
    const p = EVIDENCE_PILLAR[t as EvidenceType]
    if (!p) continue
    // P4（竞品对比支柱）影子闸门：lib/diagnosis/rules/competitors.ts 里 Q01/Q02/Q03
    // 这三条 P4 全部规则均以 `if (ctx.confirmedCompetitors.length === 0) return null` 开头——
    // 没有已确认竞品时整组规则 100% 空转、零 finding。此前仅凭 dataforseo_serp 证据存在
    // 就判定 P4「已评分」，导致首轮零竞品时 P4 显示满分 100（假阳性）。
    // 本判定是对该闸门条件的影子复制：若竞品规则集变动（新增不依赖竞品的规则、
    // 或改动/移除该闸门条件），必须同步修改这里，否则本文件与规则实际行为会再次脱节。
    if (p === 'P4' && confirmedCompetitorCount <= 0) continue
    set.add(p)
  }
  for (const p of findingPillars) if (p && (PILLARS as string[]).includes(p)) set.add(p as Pillar)
  return PILLARS.filter((p) => set.has(p))
}
