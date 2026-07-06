import type { Rule, RuleHitDraft } from '../types'

// P3 关键词规则组（证据源：GSC Search Analytics）。规则读 RuleContext 的 keywordMetrics（query 维）
// 与 queryPageMetrics（page×query 交叉维）——均来自 gsc 证据 payload，未连接 GSC 时为空 → 整组 no-op。
// —— 阈值均为启发式经验值，随 RULES_VERSION 版本化，非行业硬标准 ——

// 位置 CTR 基准（启发式经验区间）：K02 判定「高排名却异常低点击」。仅覆盖前 5 位（低 CTR 异常只看前排）。
const POSITIONAL_CTR: Record<number, number> = { 1: 0.28, 2: 0.15, 3: 0.1, 4: 0.07, 5: 0.05 }

const MIN_IMPRESSIONS = 100 // 机会词/低 CTR 判定的最低展示量门槛（滤掉长尾噪声）
const K01_POS_MIN = 4 // 机会词排名下界（第 1 页边缘）
const K01_POS_MAX = 20 // 机会词排名上界（第 2 页内，仍可优化上首页）
const K02_POS_MAX = 5 // 低 CTR 异常只看前 5 名
const K02_CTR_RATIO = 0.5 // 实际 CTR 低于位置基准的此比例 → 异常
const K06_MIN_IMPRESSIONS = 10 // 蚕食：单页最低展示量，低于此不计入争词

const round1 = (n: number): number => Math.round(n * 10) / 10
const dedupeRefs = (ids: (string | null)[]): string[] => [...new Set(ids.filter((x): x is string => !!x))]

// 域名归一：接受裸域 / 带协议 / 带路径，统一取 host 并去 www，供本站/竞品域比对（启发式，随 RULES_VERSION 固化）。
function normalizeDomain(input: string): string {
  let host = input.trim().toLowerCase()
  if (host.startsWith('http') || host.includes('/')) {
    try {
      host = new URL(host.startsWith('http') ? host : `https://${host}`).host
    } catch {
      // 解析失败则保留原串
    }
  }
  return host.replace(/^www\./, '')
}

// K03/K04 缺口/弱势词机会表展示上限（启发式：避免建议表过长）。
const KGAP_LIMIT = 20

// K01 机会词：GSC 排名 4-20 且展示量高 → 投产比最高的增长点。非问题，作机会提示（notice）。
const K01: Rule = {
  id: 'K01',
  pillar: 'P3',
  side: 'seo',
  severity: 'notice',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const opps = ctx.keywordMetrics
      .filter((m) => m.dimension === 'query')
      .filter((m) => m.position >= K01_POS_MIN && m.position <= K01_POS_MAX && m.impressions >= MIN_IMPRESSIONS)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 20)
    if (opps.length === 0) return null
    const refs = dedupeRefs(opps.map((o) => o.evidenceId))
    if (refs.length === 0) return null
    return {
      title: `发现 ${opps.length} 个关键词机会（排名 4-20、有展示量）`,
      description:
        '这些关键词已有搜索展示，但排名处在第 1 页边缘或第 2 页。通过针对性优化（内容深度、内链、意图匹配）最有希望推到首页前列，是投入产出比最高的增长点。',
      evidenceRefs: refs,
      scope: 'keywords:opportunity',
      detail: {
        keywords: opps.map((o) => ({ text: o.keyText, position: round1(o.position), impressions: o.impressions, clicks: o.clicks })),
      },
    }
  },
}

// K02 低 CTR 异常：排名 ≤5 但 CTR 低于位置基准 50% → 疑似受 SERP 特性挤压。恒为 hypothesis 起步。
const K02: Rule = {
  id: 'K02',
  pillar: 'P3',
  side: 'seo',
  severity: 'warning',
  claimType: 'hypothesis',
  evaluate(ctx): RuleHitDraft | null {
    const anomalies = ctx.keywordMetrics
      .filter((m) => m.dimension === 'query')
      .filter((m) => {
        const pos = Math.round(m.position)
        const bench = POSITIONAL_CTR[pos]
        if (!bench || pos > K02_POS_MAX) return false
        if (m.impressions < MIN_IMPRESSIONS) return false // 低展示词 CTR 波动大，不判异常
        return m.ctr < bench * K02_CTR_RATIO
      })
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 20)
    if (anomalies.length === 0) return null
    const refs = dedupeRefs(anomalies.map((o) => o.evidenceId))
    if (refs.length === 0) return null
    return {
      title: `发现 ${anomalies.length} 个高排名低点击词（疑似受 SERP 特性影响）`,
      description:
        '这些关键词已进入前 5 名，但实际点击率显著低于该位置的经验基准。可能受 SERP 特性（AI 摘要 / 精选摘要 / 图片包 / 本地包）挤压，或标题描述吸引力不足。恒为假设：须结合 SERP 特性证据（DataForSEO）才能升为推断，工具不做确定性 AI Overview 归因。',
      evidenceRefs: refs,
      scope: 'keywords:low-ctr',
      detail: {
        keywords: anomalies.map((o) => ({ text: o.keyText, position: round1(o.position), ctr: o.ctr, impressions: o.impressions })),
      },
    }
  },
}

// K06 关键词蚕食：同一 query 有 ≥2 个 page 均获展示 → 页面互相竞争、分散权重。
const K06: Rule = {
  id: 'K06',
  pillar: 'P3',
  side: 'seo',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const byQuery = new Map<string, { page: string; impressions: number; position: number }[]>()
    for (const m of ctx.queryPageMetrics) {
      if (m.impressions < K06_MIN_IMPRESSIONS) continue
      const arr = byQuery.get(m.query) ?? []
      arr.push({ page: m.page, impressions: m.impressions, position: m.position })
      byQuery.set(m.query, arr)
    }
    const cannibalized = [...byQuery.entries()]
      .map(([query, pages]) => ({ query, pages, pageCount: new Set(pages.map((p) => p.page)).size }))
      .filter((c) => c.pageCount >= 2)
      .sort((a, b) => b.pages.reduce((s, p) => s + p.impressions, 0) - a.pages.reduce((s, p) => s + p.impressions, 0))
      .slice(0, 20)
    if (cannibalized.length === 0) return null
    const refs = dedupeRefs(ctx.queryPageMetrics.map((m) => m.evidenceId))
    if (refs.length === 0) return null
    return {
      title: `发现 ${cannibalized.length} 个关键词蚕食（多页争同一词）`,
      description:
        '同一搜索词有多个页面同时获得展示，页面间互相竞争、分散权重与点击。按决策表处理：两页均有独立价值 → 用 canonical 指定主页；应彻底合并 → 用 301 重定向；跨域名 canonical 无效。',
      evidenceRefs: refs,
      scope: 'keywords:cannibalization',
      detail: {
        queries: cannibalized.map((c) => ({
          query: c.query,
          pageCount: c.pageCount,
          pages: [...c.pages]
            .sort((a, b) => a.position - b.position)
            .slice(0, 5)
            .map((p) => ({ url: p.page, position: round1(p.position), impressions: p.impressions })),
        })),
      },
    }
  },
}

// K03 缺口词（missing）：≥2 个确认竞品进 Top10 而本站无排名（gapType==='missing'）。
// 由 keyword-gap 计算后经 ctx.keywordGaps 传入；首轮无 gap → null。机会类（notice），第三方估算 → measured_sample。
const K03: Rule = {
  id: 'K03',
  pillar: 'P3',
  side: 'seo',
  severity: 'notice',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const gaps = ctx.keywordGaps
      .filter((g) => g.gapType === 'missing')
      .sort((a, b) => (b.opportunityScore ?? -Infinity) - (a.opportunityScore ?? -Infinity))
      .slice(0, KGAP_LIMIT)
    if (gaps.length === 0) return null
    const refs = dedupeRefs(gaps.map((g) => g.evidenceId))
    if (refs.length === 0) return null
    return {
      title: `发现 ${gaps.length} 个缺口关键词（竞品有排名、本站无）`,
      description:
        '这些关键词已有确认竞品进入 Google Top10，而本站在种子词 SERP 中无排名。按「搜索量 × 意图 × 难度可及性」估算的机会分排序，是内容拓展的优先候选。机会分与搜索量为第三方估算，作方向性参考。',
      evidenceRefs: refs,
      scope: 'keywords:gap-missing',
      detail: {
        keywords: gaps.map((g) => ({
          text: g.keyword,
          searchVolume: g.searchVolume,
          opportunityScore: g.opportunityScore,
          ourPosition: g.ourPosition,
        })),
      },
    }
  },
}

// K04 弱势词（weak）：本站 11-30 名、竞品 Top10（gapType==='weak'）。机会类（notice），measured_sample。
const K04: Rule = {
  id: 'K04',
  pillar: 'P3',
  side: 'seo',
  severity: 'notice',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const gaps = ctx.keywordGaps
      .filter((g) => g.gapType === 'weak')
      .sort((a, b) => (b.opportunityScore ?? -Infinity) - (a.opportunityScore ?? -Infinity))
      .slice(0, KGAP_LIMIT)
    if (gaps.length === 0) return null
    const refs = dedupeRefs(gaps.map((g) => g.evidenceId))
    if (refs.length === 0) return null
    return {
      title: `发现 ${gaps.length} 个弱势关键词（本站 11-30 名、竞品 Top10）`,
      description:
        '这些关键词本站已有排名但停在第 2-3 页，而确认竞品进入了 Top10。已有承接页、只差临门一脚，通过内容深化与内链最有希望推上首页，投产比高于从零新建。搜索量与机会分为第三方估算。',
      evidenceRefs: refs,
      scope: 'keywords:gap-weak',
      detail: {
        keywords: gaps.map((g) => ({
          text: g.keyword,
          searchVolume: g.searchVolume,
          opportunityScore: g.opportunityScore,
          ourPosition: g.ourPosition,
        })),
      },
    }
  },
}

// K05 品牌词覆盖：品牌 SERP 本站缺席，或首位被第三方占位 → warning（measured_sample）。无 brandSerp 证据 → null。
const K05: Rule = {
  id: 'K05',
  pillar: 'P3',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const bs = ctx.dataforseo.brandSerp
    if (!bs) return null
    const own = normalizeDomain(ctx.project.domain)
    const top = [...bs.items].sort((a, b) => a.rank - b.rank)[0] ?? null
    const topIsThirdParty = top ? normalizeDomain(top.domain) !== own : false
    // 本站已在场且占据首位 → 品牌词已被良好覆盖，不告警。
    if (bs.ownDomainPresent && !topIsThirdParty) return null
    const reason = !bs.ownDomainPresent ? 'own_absent' : 'top_third_party'
    return {
      title: bs.ownDomainPresent ? '品牌词 SERP 首位被第三方占位' : '品牌词 SERP 首页无本站排名',
      description:
        '品牌词是转化最直接、竞争最低的词。本站在品牌词 SERP 首页缺席或首位被第三方（目录/媒体/竞品）占据，等于把最该拿下的流量拱手让人，也削弱 AI 引擎对品牌实体的锚定。优先确保官网在品牌词稳居首位。',
      evidenceRefs: [bs.evidenceId],
      scope: 'keywords:brand-serp',
      detail: {
        brandQuery: bs.brandQuery,
        ownDomainPresent: bs.ownDomainPresent,
        reason,
        top: top ? { domain: top.domain, rank: top.rank } : null,
        items: bs.items.slice(0, 5),
      },
    }
  },
}

// —— K07 页型推断（启发式）——
// 局限：RuleContext.serpByKeyword 的 item 不含 SERP 结果页型字段，无法直接读「SERP 主导页型」；
// 故近似为：以 Labs intent 代表该词的主导意图，以本站承接 URL 的路径特征近似本站承接页型，二者冲突即疑似意图错位。
// 恒 inferred（数据有限、路径判型为近似）。随 RULES_VERSION 固化。
function urlPageClass(url: string): 'informational' | 'transactional' | 'other' {
  let path = ''
  try {
    path = new URL(url.startsWith('http') ? url : `https://${url}`).pathname.toLowerCase()
  } catch {
    path = url.toLowerCase()
  }
  if (/\b(blog|article|articles|news|guide|guides|tutorial|tutorials|post|posts|resource|resources|faq)\b/.test(path) || /\/20\d\d\//.test(path)) {
    return 'informational'
  }
  if (/\b(product|products|shop|store|buy|pricing|price|checkout|cart|deal|deals|order)\b/.test(path)) {
    return 'transactional'
  }
  return 'other'
}
function intentClass(intent: string | null): 'informational' | 'transactional' | null {
  if (!intent) return null
  const i = intent.toLowerCase()
  if (i.includes('info')) return 'informational'
  if (i.includes('transac') || i.includes('commerc')) return 'transactional'
  return null // navigational / 未知意图不判
}

// K07 搜索意图错位：目标词主导意图与本站承接页型不匹配（如交易意图词却用博客文承接）。warning，inferred。
const K07: Rule = {
  id: 'K07',
  pillar: 'P3',
  side: 'seo',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const own = normalizeDomain(ctx.project.domain)
    const mismatches: { keyword: string; intent: string; ourUrl: string; ourPageType: string; expected: string; ourRank: number; evidenceId: string }[] = []
    for (const s of ctx.dataforseo.serpByKeyword) {
      const kd = ctx.dataforseo.keywordData.find((k) => k.keyword === s.keyword)
      const intent = kd?.intent ?? null
      const ic = intentClass(intent)
      if (!ic || intent === null) continue
      const ownItem = s.items.find((it) => normalizeDomain(it.domain) === own)
      if (!ownItem) continue // 本站无承接页则归入缺口/弱势（K03/K04），此处只看已排名词的页型匹配
      const pc = urlPageClass(ownItem.url)
      if (pc === 'other' || pc === ic) continue
      mismatches.push({ keyword: s.keyword, intent, ourUrl: ownItem.url, ourPageType: pc, expected: ic, ourRank: ownItem.rank, evidenceId: s.evidenceId })
    }
    if (mismatches.length === 0) return null
    const refs = dedupeRefs(mismatches.map((m) => m.evidenceId))
    if (refs.length === 0) return null
    return {
      title: `发现 ${mismatches.length} 个疑似搜索意图错位关键词`,
      description:
        '这些关键词的主导搜索意图（据 DataForSEO Labs 意图标注）与本站当前承接页的页型不匹配——例如交易意图词却用博客文承接、信息意图词却用产品页承接，会拉低相关性与转化。系推断：页型据 URL 路径特征近似判断、SERP 主导页型未直接取证，须人工核对承接页后再定改法。',
      evidenceRefs: refs,
      scope: 'keywords:intent-mismatch',
      detail: {
        keywords: mismatches.slice(0, KGAP_LIMIT).map((m) => ({
          text: m.keyword,
          intent: m.intent,
          ourUrl: m.ourUrl,
          ourPageType: m.ourPageType,
          expectedPageType: m.expected,
          ourRank: round1(m.ourRank),
        })),
      },
    }
  },
}

export const keywordRules: Rule[] = [K01, K02, K06, K03, K04, K05, K07]
