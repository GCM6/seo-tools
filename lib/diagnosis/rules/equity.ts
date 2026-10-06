import type { Rule, RuleContext, RuleHitDraft } from '../types'
import { analyzeLinkEquity, isGenericAnchor, type LinkEquity } from '@/lib/crawl/link-equity'
import type { LinkGraphEdge } from '@/lib/crawl/link-graph'

// 内链权重规则组 W01–W04（spec 2026-09-29-s3-internal-link-equity §4）。
// 计算在 analyzeLinkEquity（与站点结构页「内链权重」列同源）；守卫：无图谱 / 入口零出链 / 已抓 HTML 页 < 10 → null。
// PageRank 是模型：W01/W02/W04 一律 inferred；W03 的锚文本分布是实测事实。

const MAX_EXAMPLES = 10
const W01_MAX_RELATIVE = 0.5 // 低于中位数一半才算偏低（扁平站点不误报）
const W02_TOP_N = 10
const W02_MIN_LOW_VALUE = 3
const W02_MIN_RELATIVE = 1.5 // 前 10 中只统计明显高于中位数的低价值页
const MIN_INBOUND = 3
const W03_GENERIC_SHARE = 0.5
const W04_MAIN_SHARE = 0.2
const LOW_COVERAGE = 0.5

function equityOf(ctx: RuleContext): { auditId: string; eq: LinkEquity } | null {
  const audit = ctx.siteAudit
  if (!audit) return null
  const eq = analyzeLinkEquity({ payload: audit.payload, queryPageMetrics: ctx.queryPageMetrics })
  return eq ? { auditId: audit.id, eq } : null
}

const coverageNote = (eq: LinkEquity) =>
  eq.coverage < LOW_COVERAGE ? `（本次抓取覆盖不足：已抓 HTML 页仅占链接图节点的 ${Math.round(eq.coverage * 100)}%，结果仅供方向参考）` : ''

function followableInbound(eq: LinkEquity, url: string): LinkGraphEdge[] {
  return eq.graph.edges.filter((e) => e.to === url && e.followable)
}

const W01: Rule = {
  id: 'W01',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const got = equityOf(ctx)
    if (!got) return null
    const { eq } = got
    const weak = eq.valuePages
      .map((v) => ({ ...v, relative: eq.relative.get(v.url) ?? 0, inFollow: eq.graph.nodeByUrl.get(v.url)?.inFollow ?? 0 }))
      .filter((v) => v.relative < W01_MAX_RELATIVE)
    if (weak.length === 0) return null
    return {
      title: '高价值页拿到的内链权重偏低',
      description: `在本次抓取的链接图内，${weak.length} 个高价值页（GSC 有点击/展现的前列页或人工标记的重点页）的站内 PageRank 不到全站中位数的一半。内链权重是模型估算，不是搜索引擎的真实权重；方向上说明这些页从站内获得的链接支持偏少。${coverageNote(eq)}`,
      // 「高价值」来自 GSC 时一并引用其证据（第三轮独立审查 P2-13）
      evidenceRefs: [got.auditId, ...new Set(weak.flatMap((v) => v.evidenceIds))],
      scope: 'site',
      detail: {
        count: weak.length, coverage: Number(eq.coverage.toFixed(2)), closureComplete: eq.graph.closureComplete,
        examples: weak.slice(0, MAX_EXAMPLES).map((v) => ({ url: v.url, source: v.source, clicks: v.clicks, impressions: v.impressions, relative: Number(v.relative.toFixed(2)), inFollow: v.inFollow })),
      },
    }
  },
}

const W02: Rule = {
  id: 'W02',
  pillar: 'P1',
  side: 'technical',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const got = equityOf(ctx)
    if (!got) return null
    const { eq } = got
    const top = eq.graph.nodes
      .filter((n) => n.html)
      .sort((a, b) => (eq.rank.get(b.url) ?? 0) - (eq.rank.get(a.url) ?? 0))
      .slice(0, W02_TOP_N)
    const low = top.filter((n) => eq.lowValue.has(n.url) && (eq.relative.get(n.url) ?? 0) >= W02_MIN_RELATIVE)
    if (low.length < W02_MIN_LOW_VALUE) return null
    const share = low.reduce((s, n) => s + (eq.rank.get(n.url) ?? 0), 0)
    return {
      title: '内链权重集中在低价值页面',
      description: `在本次抓取的链接图内，站内 PageRank 前 ${W02_TOP_N} 的页面中有 ${low.length} 个是 noindex、canonical 指向他页或分页/标签页，且估算权重均在全站中位数的 ${W02_MIN_RELATIVE} 倍以上，合计占全站估算权重的 ${(share * 100).toFixed(1)}%。可以减少全站模板对这类页面的链接，把链接让给需要排名的页面。${coverageNote(eq)}`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: {
        count: low.length, rankShare: Number(share.toFixed(4)), coverage: Number(eq.coverage.toFixed(2)),
        examples: low.map((n) => ({ url: n.url, reasons: eq.lowValue.get(n.url), relative: Number((eq.relative.get(n.url) ?? 0).toFixed(2)) })),
      },
    }
  },
}

const W03: Rule = {
  id: 'W03',
  pillar: 'P1',
  side: 'technical',
  severity: 'notice',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const got = equityOf(ctx)
    if (!got) return null
    const { eq } = got
    const rows = eq.valuePages
      .map((v) => {
        const edges = followableInbound(eq, v.url)
        // 一条入链的所有锚文本都是空或泛化词，才算这条入链没有描述性锚文本。
        const generic = edges.filter((e) => e.anchors.length === 0 || e.anchors.every(isGenericAnchor))
        return { url: v.url, inbound: edges.length, genericShare: edges.length ? generic.length / edges.length : 0, samples: generic.slice(0, 3).map((e) => ({ from: e.from, anchor: e.anchors[0] ?? '' })) }
      })
      .filter((r) => r.inbound >= MIN_INBOUND && r.genericShare >= W03_GENERIC_SHARE)
    if (rows.length === 0) return null
    return {
      title: '高价值页的入链锚文本缺少描述性',
      description: `${rows.length} 个高价值页的站内入链中，有一半以上锚文本为空或是「了解更多」「Read more」这类泛化词。描述性锚文本帮助搜索引擎与访客理解目标页的主题（机制说明，非排名量化断言）。`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: { count: rows.length, examples: rows.slice(0, MAX_EXAMPLES).map((r) => ({ ...r, genericShare: Number(r.genericShare.toFixed(2)) })) },
    }
  },
}

const W04: Rule = {
  id: 'W04',
  pillar: 'P1',
  side: 'technical',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const got = equityOf(ctx)
    if (!got) return null
    const { eq } = got
    const rows = eq.valuePages
      .map((v) => {
        const edges = followableInbound(eq, v.url)
        const main = edges.filter((e) => e.regions.includes('main'))
        return { url: v.url, inbound: edges.length, mainShare: edges.length ? main.length / edges.length : 0 }
      })
      .filter((r) => r.inbound >= MIN_INBOUND && r.mainShare < W04_MAIN_SHARE)
    if (rows.length === 0) return null
    return {
      title: '高价值页缺少正文中的上下文内链',
      description: `${rows.length} 个高价值页的可跟随入链主要来自导航、页眉、页脚等全站模板区域，来自正文的不足 ${W04_MAIN_SHARE * 100}%。链接所在区域是启发式识别；正文中的上下文链接通常更能说明页面之间的主题关系。`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: { count: rows.length, examples: rows.slice(0, MAX_EXAMPLES).map((r) => ({ ...r, mainShare: Number(r.mainShare.toFixed(2)) })) },
    }
  },
}

export const equityRules: Rule[] = [W01, W02, W03, W04]
