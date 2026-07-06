import type { Rule, RuleHitDraft } from '../types'

// P4 竞品对比规则组（证据源：DataForSEO SERP + 既有 AI 探针聚合 + 缺口词）。
// 人在环闸门：只有 ctx.confirmedCompetitors（status=confirmed）非空才进对比；首轮为空 → 整组 no-op。
// —— 阈值/口径为启发式，随 RULES_VERSION 固化，非行业硬标准 ——

// Share of SERP 只统计 Top10 占位（第 1 页），与「首页可见性」口径对齐（启发式）。
const TOP_N = 10

const dedupeRefs = (ids: (string | null)[]): string[] => [...new Set(ids.filter((x): x is string => !!x))]

// 域名归一：接受裸域 / 带协议 / 带路径，统一取 host 去 www（启发式，随 RULES_VERSION 固化）。
function normalizeDomain(input: string): string {
  let host = input.trim().toLowerCase()
  if (host.startsWith('http') || host.includes('/')) {
    try {
      host = new URL(host.startsWith('http') ? host : `https://${host}`).host
    } catch {
      // 解析失败保留原串
    }
  }
  return host.replace(/^www\./, '')
}

// Q01 竞品 Share of SERP 对比：统计本站 vs 各确认竞品在种子词集的 Top10 占位数。对比类（notice），measured_sample。
const Q01: Rule = {
  id: 'Q01',
  pillar: 'P4',
  side: 'seo',
  severity: 'notice',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const comps = ctx.confirmedCompetitors
    if (comps.length === 0) return null // 竞品未确认 → no-op（人在环闸门）
    const serp = ctx.dataforseo.serpByKeyword
    if (serp.length === 0) return null
    const own = normalizeDomain(ctx.project.domain)
    const compDomains = comps.map((c) => ({ ...c, norm: normalizeDomain(c.domain) }))
    let ownCount = 0
    const compCounts = new Map<string, number>() // key: 竞品归一域 → Top10 占位数
    for (const s of serp) {
      for (const it of s.items) {
        if (it.rank > TOP_N) continue
        const d = normalizeDomain(it.domain)
        if (d === own) ownCount++
        for (const c of compDomains) {
          if (d === c.norm) compCounts.set(c.norm, (compCounts.get(c.norm) ?? 0) + 1)
        }
      }
    }
    // 本站与全部确认竞品在种子词集都零占位 → 无对比信号。
    if (ownCount === 0 && compCounts.size === 0) return null
    const refs = dedupeRefs(serp.map((s) => s.evidenceId))
    if (refs.length === 0) return null
    const comparison = [
      { name: ctx.project.domain, domain: own, top10Count: ownCount, you: true },
      ...compDomains.map((c) => ({ name: c.name, domain: c.norm, top10Count: compCounts.get(c.norm) ?? 0, you: false })),
    ].sort((a, b) => b.top10Count - a.top10Count)
    return {
      title: '竞品 SERP 份额对比（种子词 Top10 占位）',
      description:
        '在确认竞品共同争夺的种子关键词集上，统计本站与各竞品进入 Google Top10（第 1 页）的占位次数。占位越多代表在该词集的首页可见性越强。数据为 DataForSEO 第三方 SERP 快照，作方向性对比，不逐词下结论。',
      evidenceRefs: refs,
      scope: 'competitors:share-of-serp',
      detail: { keywordCount: serp.length, topN: TOP_N, comparison },
    }
  },
}

// Q02 竞品 AI SoV 对比：复用既有探针 SoV，本站 vs 确认竞品在 AI 答案中的出现占比。measured_sample，方向性 n=5。
// 局限：当前 ProbeSummary.sov 为跨引擎合并聚合，未分引擎；分引擎拆分待 probe 聚合扩展，此处为合并 SoV。
const Q02: Rule = {
  id: 'Q02',
  pillar: 'P4',
  side: 'geo',
  severity: 'notice',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const comps = ctx.confirmedCompetitors
    if (comps.length === 0) return null
    const { probe, probeEvidenceId } = ctx
    if (!probe || !probeEvidenceId) return null
    const ownSov = probe.sov.find((s) => s.you)
    if (!ownSov) return null
    // 匹配确认竞品到探针 SoV 条目（reeval 时确认竞品域已并入探针竞品集）：按归一域或名称匹配。
    const matched = comps
      .map((c) => {
        const nd = normalizeDomain(c.domain)
        const entry = probe.sov.find((s) => !s.you && (normalizeDomain(s.name) === nd || s.name.toLowerCase() === c.name.toLowerCase()))
        return entry ? { name: c.name, domain: nd, pct: entry.pct } : null
      })
      .filter((x): x is { name: string; domain: string; pct: number } => x !== null)
    if (matched.length === 0) return null // 确认竞品均未进入探针竞品集 → 无对比数据
    const comparison = [
      { name: ctx.project.domain, pct: ownSov.pct, you: true },
      ...matched.map((m) => ({ name: m.name, pct: m.pct, you: false })),
    ].sort((a, b) => b.pct - a.pct)
    return {
      title: '竞品 AI 可见度（SoV）对比',
      description:
        '在同一探针问题集上，统计本站与确认竞品在 AI 答案（ChatGPT/Perplexity/Gemini/Claude）中被提及的占比（Share of Voice）。当前 n=5 为方向性样本、跨引擎合并口径，非硬指标；分引擎拆分待后续。',
      evidenceRefs: [probeEvidenceId],
      scope: 'competitors:ai-sov',
      detail: { comparison, directional: true, totalSamples: probe.totalSamples },
    }
  },
}

// Q03 竞品缺口词内容形态：有确认竞品 + 缺口词时，提示参照竞品代表页归纳页型/字数/schema。notice，inferred。
const Q03: Rule = {
  id: 'Q03',
  pillar: 'P4',
  side: 'seo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const comps = ctx.confirmedCompetitors
    if (comps.length === 0) return null
    const gaps = ctx.keywordGaps.filter((g) => g.gapType === 'missing' || g.gapType === 'weak')
    if (gaps.length === 0) return null
    const refs = dedupeRefs(gaps.map((g) => g.evidenceId))
    if (refs.length === 0) return null
    const sample = [...gaps]
      .sort((a, b) => (b.opportunityScore ?? -Infinity) - (a.opportunityScore ?? -Infinity))
      .slice(0, 10)
    return {
      title: '缺口词内容形态建议参照确认竞品',
      description:
        '本站在这些缺口/弱势词上落后于确认竞品。建议抓取竞品在这些词的代表排名页，归纳其页面类型（信息文/产品页/榜单）、正文字数与 schema 形态，作为内容简报（Content Brief）的输入。系推断级：竞品形态仅供参照、非套用模板，须结合本站定位人工裁定。',
      evidenceRefs: refs,
      scope: 'competitors:gap-content-form',
      detail: {
        competitors: comps.map((c) => normalizeDomain(c.domain)),
        keywords: sample.map((g) => ({ text: g.keyword, gapType: g.gapType, searchVolume: g.searchVolume })),
      },
    }
  },
}

export const competitorRules: Rule[] = [Q01, Q02, Q03]
