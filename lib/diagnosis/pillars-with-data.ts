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

// 证据"可用" = 采集成功且非空（SP-A §5.4）。新代码采集失败不再写证据（§4.1），本函数主要防御历史数据——
// 典型历史形态：PSI 失败却以全 null 载荷落库并记 collected。
export function evidenceUsable(type: string, payload: unknown): boolean {
  if (payload == null || (typeof payload === 'object' && Object.keys(payload as object).length === 0)) return false
  if (type === 'psi') {
    const p = payload as { crux?: { hasFieldData?: boolean }; lighthouse?: { performanceScore?: number | null } }
    return Boolean(p.crux?.hasFieldData) || typeof p.lighthouse?.performanceScore === 'number'
  }
  // GSC 一行数据都没有（新站 / 国家过滤无数据）：P3 规则无从评估，不能因此给 100 分（第二波审查 I5）。
  if (type === 'gsc') {
    const rows = (payload as { rows?: unknown }).rows
    return Array.isArray(rows) && rows.length > 0
  }
  // UA 探测每个请求都失败时状态全为 null：没测到任何东西（第二波审查 I2）。
  if (type === 'ua_probe') {
    const crawlers = (payload as { crawlers?: unknown }).crawlers
    return Array.isArray(crawlers) && crawlers.some((c) => typeof (c as { status?: unknown } | null)?.status === 'number')
  }
  // dataforseo_serp 只映射 P4（竞品对比）：只认种子词 SERP 且至少一个词有结果。品牌词 / Bing 收录的 SERP 证据
  // 评估不了 Q01–Q03，不能让 P4 在种子 SERP 失败或没有种子时拿满分（最终审查 F2-1）。
  if (type === 'dataforseo_serp') {
    const p = payload as { kind?: unknown; results?: unknown }
    return p.kind === 'seed_serp' && Array.isArray(p.results) &&
      p.results.some((r) => Array.isArray((r as { items?: unknown } | null)?.items) && (r as { items: unknown[] }).items.length > 0)
  }
  // 第三方语料：v2 至少一路 ok；v1 旧载荷只有 Reddit 正数提及可信（维基是全文搜索、0 条可能是 403 被记成 0；第二波审查 I3）。
  if (type === 'third_party_presence') {
    const p = payload as { version?: number; wikipedia?: { status?: string }; reddit?: { status?: string; mentions?: unknown } }
    if (p.version === 2) return p.wikipedia?.status === 'ok' || p.reddit?.status === 'ok'
    return typeof p.reddit?.mentions === 'number' && p.reddit.mentions > 0
  }
  return true
}

/**
 * 判定本轮 run 实际「已评分」的支柱集合：只看可用证据，不再因"有发现"就让支柱入分（SP-A §5.4）。
 * 已知副作用：K05（品牌词 SERP，属 P3）在 P3 未评分时仍作为发现展示，只是不计分；按检查完成度评分由子项目 B 做。
 *
 * @param evidence 本轮证据（type + payload）
 * @param confirmedCompetitorCount 已确认竞品数量（status=confirmed）——P4 专用闸门，见下方注释
 */
export function pillarsWithData(
  evidence: { type: string; payload?: unknown }[],
  confirmedCompetitorCount: number,
): Pillar[] {
  const set = new Set<Pillar>()
  for (const e of evidence) {
    if (!evidenceUsable(e.type, e.payload)) continue
    const p = EVIDENCE_PILLAR[e.type as EvidenceType]
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
  return PILLARS.filter((p) => set.has(p))
}
