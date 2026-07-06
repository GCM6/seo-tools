import type { Rule, RuleHitDraft } from '../types'

// P5 权威/实体规则组（证据源：DataForSEO Backlinks / Bing site: / 品牌词 SERP / Labs 品牌搜索量）。
// 均为第三方估算（L3）→ claim 上限 measured_sample；对比类规则依赖 ctx.confirmedCompetitors，未确认 → no-op。
// —— 阈值为启发式经验值，随 RULES_VERSION 固化，非行业硬标准 ——

const A02_KEYWORD_SHARE_MAX = 0.4 // 精准关键词锚（非品牌/非通用/非裸链）占比上界（启发式）
const A02_TOP_ANCHOR_SHARE_MAX = 0.2 // 单一关键词锚占全部外链的占比上界（启发式）
const A03_MIN_NEW = 50 // 外链激增判定的最小新增数（启发式）
const A03_NEW_LOST_RATIO = 5 // 新增/流失不对称比阈值（激增信号，启发式）
const G04_LOW_INDEX = 5 // Bing 收录「极低」阈值（启发式）

// 通用/导航型锚文本（不计为精准关键词锚）。
const GENERIC_ANCHORS = new Set([
  '', 'click here', 'here', 'link', 'this', 'this link', 'website', 'web site', 'site',
  'visit', 'visit website', 'read more', 'more', 'learn more', 'home', 'homepage', 'www',
])

const dedupeRefs = (ids: (string | null)[]): string[] => [...new Set(ids.filter((x): x is string => !!x))]

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

// 二级域名主体（品牌 token 近似）：example.com → example。
function sld(domain: string): string {
  const parts = normalizeDomain(domain).split('.')
  return parts[0] ?? ''
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

// A01 外链概况：本站引荐域数对比确认竞品中位数（measured_sample）。无竞品 backlinks → 仅出本站概况（notice）。
const A01: Rule = {
  id: 'A01',
  pillar: 'P5',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const bl = ctx.dataforseo.backlinks
    if (bl.length === 0) return null
    const own = normalizeDomain(ctx.project.domain)
    const ownBl = bl.find((b) => normalizeDomain(b.target) === own)
    if (!ownBl) return null
    const compBls = ctx.confirmedCompetitors
      .map((c) => bl.find((b) => normalizeDomain(b.target) === normalizeDomain(c.domain)))
      .filter((x): x is NonNullable<typeof x> => !!x)
    // 无确认竞品 backlinks → 仅出本站概况，不下对比结论（notice）。
    if (compBls.length === 0) {
      return {
        title: '本站外链概况',
        description:
          '本站外链概况（引荐域数 / 反链数 / 域权重），仅概况不做逐链审计。当前无确认竞品的外链数据作对比基准，接入竞品后可判断相对强弱。数据为 DataForSEO 第三方估算。',
        evidenceRefs: [ownBl.evidenceId],
        scope: 'authority:backlinks',
        severity: 'notice',
        detail: { own: { referringDomains: ownBl.referringDomains, backlinks: ownBl.backlinks, rank: ownBl.rank } },
      }
    }
    const medianRd = median(compBls.map((b) => b.referringDomains))
    const behind = ownBl.referringDomains < medianRd
    const refs = dedupeRefs([ownBl.evidenceId, ...compBls.map((b) => b.evidenceId)])
    return {
      title: behind ? '引荐域数低于确认竞品中位数' : '外链引荐域对比',
      description: behind
        ? '本站引荐域数低于确认竞品的中位水平，外链权威度存在差距。外链是排名与 AI 语料信任的重要信号，建议按主题相关性稳步补充高质量引荐域。仅做概况对比，不逐链审计；数据为第三方估算。'
        : '本站引荐域数不低于确认竞品中位数，外链权威度处于同侪水平。仅做概况对比，不逐链审计；数据为第三方估算。',
      evidenceRefs: refs,
      scope: 'authority:backlinks',
      severity: behind ? 'warning' : 'notice',
      detail: {
        own: { referringDomains: ownBl.referringDomains, backlinks: ownBl.backlinks, rank: ownBl.rank },
        competitorMedianReferringDomains: medianRd,
        competitors: compBls.map((b) => ({ target: normalizeDomain(b.target), referringDomains: b.referringDomains, rank: b.rank })),
      },
    }
  },
}

// A02 锚文本过度优化：精准关键词锚占比或单一关键词锚占比过高 → 过度优化画像（有处罚风险）。warning，measured_sample。
const A02: Rule = {
  id: 'A02',
  pillar: 'P5',
  side: 'seo',
  severity: 'warning',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const own = normalizeDomain(ctx.project.domain)
    const brand = sld(ctx.project.domain)
    const ownBl = ctx.dataforseo.backlinks.find((b) => normalizeDomain(b.target) === own)
    if (!ownBl || ownBl.anchors.length === 0) return null
    const total = ownBl.anchors.reduce((sum, a) => sum + a.count, 0)
    if (total === 0) return null
    const isKeywordAnchor = (anchor: string): boolean => {
      const a = anchor.trim().toLowerCase()
      if (GENERIC_ANCHORS.has(a)) return false
      if (/^https?:\/\//.test(a)) return false // 裸链接
      if (/^[\w.-]+\.[a-z]{2,}$/.test(a)) return false // 裸域名
      if ((brand.length >= 2 && a.includes(brand)) || a.includes(own)) return false // 品牌/域名锚
      return a.length > 0
    }
    const kwAnchors = ownBl.anchors.filter((a) => isKeywordAnchor(a.anchor))
    const kwCount = kwAnchors.reduce((sum, a) => sum + a.count, 0)
    const share = kwCount / total
    const topKw = [...kwAnchors].sort((a, b) => b.count - a.count)[0] ?? null
    const topShare = topKw ? topKw.count / total : 0
    if (share < A02_KEYWORD_SHARE_MAX && topShare < A02_TOP_ANCHOR_SHARE_MAX) return null
    return {
      title: '锚文本过度优化（精准关键词锚占比过高）',
      description:
        '本站外链的锚文本中，精准关键词锚（非品牌、非通用、非裸链）占比偏高。自然外链画像应以品牌词/裸 URL/通用词为主，关键词锚过度集中是典型的人工干预信号，有被算法降权的风险。建议放缓关键词锚增速、丰富锚文本结构。数据为第三方估算。',
      evidenceRefs: [ownBl.evidenceId],
      scope: 'authority:anchors',
      detail: {
        keywordAnchorShare: Math.round(share * 100) / 100,
        topAnchorShare: Math.round(topShare * 100) / 100,
        topAnchor: topKw ? { anchor: topKw.anchor, count: topKw.count } : null,
        sampleKeywordAnchors: [...kwAnchors].sort((a, b) => b.count - a.count).slice(0, 5).map((a) => ({ anchor: a.anchor, count: a.count })),
      },
    }
  },
}

// A03 外链增长节奏异常：短窗口内新增外链激增且明显不对称（new >> lost），提示非自然增长风险。notice，inferred。无 newLost → null。
const A03: Rule = {
  id: 'A03',
  pillar: 'P5',
  side: 'seo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const own = normalizeDomain(ctx.project.domain)
    const ownBl = ctx.dataforseo.backlinks.find((b) => normalizeDomain(b.target) === own)
    if (!ownBl || !ownBl.newLost) return null
    const nl = ownBl.newLost
    const asym = nl.lost === 0 ? nl.new : nl.new / Math.max(nl.lost, 1)
    const spike = nl.new >= A03_MIN_NEW && asym >= A03_NEW_LOST_RATIO
    if (!spike) return null
    return {
      title: '外链增长节奏异常（短窗口内激增）',
      description: `近 ${nl.windowDays} 天内新增外链 ${nl.new} / 流失 ${nl.lost}，短窗口内大量单向激增。自然外链通常平稳增长，突发激增可能来自批量购买或垃圾外链，存在非自然增长与被惩罚风险。系推断：需人工核对新增外链来源质量后再定性。数据为第三方估算。`,
      evidenceRefs: [ownBl.evidenceId],
      scope: 'authority:link-velocity',
      detail: { new: nl.new, lost: nl.lost, windowDays: nl.windowDays, totalBacklinks: ownBl.backlinks },
    }
  },
}

// G04 Bing 收录缺失：Bing site: 收录数为 0 或极低 → 影响 ChatGPT（默认走 Bing 检索）可发现性。warning，measured_sample，side='geo'。
const G04: Rule = {
  id: 'G04',
  pillar: 'P5',
  side: 'geo',
  severity: 'warning',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const bi = ctx.dataforseo.bingIndex
    if (!bi) return null
    const indexed = bi.totalCount ?? bi.itemCount
    if (indexed > G04_LOW_INDEX) return null
    const zero = indexed === 0
    return {
      title: zero ? 'Bing 未收录本站' : 'Bing 收录极低',
      description: zero
        ? 'Bing site: 查询显示本站几乎未被收录。ChatGPT 等 AI 引擎默认走 Bing 检索取答，Bing 不收录等于放弃在这些 AI 答案中被检索引用的资格。建议核查 Bing Webmaster、提交 sitemap、排除对 bingbot 的屏蔽。收录数为第三方估算。'
        : 'Bing site: 查询显示本站收录页数极低。ChatGPT 等 AI 引擎默认走 Bing 检索取答，收录不足会显著限制在这些 AI 答案中的可发现性。建议核查 Bing Webmaster 收录与抓取状态。收录数为第三方估算。',
      evidenceRefs: [bi.evidenceId],
      scope: 'geo:bing-index',
      detail: { totalCount: bi.totalCount, itemCount: bi.itemCount, indexed },
    }
  },
}

// E02 品牌 Knowledge Panel 缺失：品牌词 SERP 无 knowledge_graph → 仅提示实体建设方向，不作处罚结论。notice，measured_sample，side='geo'。
const E02: Rule = {
  id: 'E02',
  pillar: 'P5',
  side: 'geo',
  severity: 'notice',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const bs = ctx.dataforseo.brandSerp
    if (!bs) return null
    if (bs.hasKnowledgePanel) return null // 有 KP = 正向事实，别处记录，本规则只标缺失
    return {
      title: '品牌词 SERP 无 Knowledge Panel',
      description:
        '品牌词搜索结果未出现 Knowledge Panel，说明品牌实体尚未被 Google 稳定识别为确定实体。这会削弱搜索与 AI 引擎对品牌的锚定。仅提示实体建设方向（Wikidata 条目、权威 sameAs、跨平台一致 NAP），不作处罚性结论。',
      evidenceRefs: [bs.evidenceId],
      scope: 'geo:knowledge-panel',
      detail: { brandQuery: bs.brandQuery, hasKnowledgePanel: false },
    }
  },
}

// 品牌搜索量匹配：关键词文本包含品牌 token 或归一域名主体即视为该主体的品牌词。
function matchesBrand(keyword: string, token: string, domainNorm: string): boolean {
  const k = keyword.toLowerCase()
  if (token.length >= 2 && k.includes(token)) return true
  if (domainNorm && k.includes(domainNorm)) return true
  return false
}

// E03 品牌搜索量对比（GEO 信任代理指标）：本站品牌词月均搜索量 vs 确认竞品。对比类（notice），measured_sample，side='geo'。
// 只做度量与对比展示，不下因果结论（品牌提及与 AI 可见性相关 §2 r=0.664，仅相关非因果）。
const E03: Rule = {
  id: 'E03',
  pillar: 'P5',
  side: 'geo',
  severity: 'notice',
  claimType: 'measured_sample',
  evaluate(ctx): RuleHitDraft | null {
    const comps = ctx.confirmedCompetitors
    if (comps.length === 0) return null
    const kd = ctx.dataforseo.keywordData
    if (kd.length === 0) return null
    const own = normalizeDomain(ctx.project.domain)
    const brand = sld(ctx.project.domain)
    const ownEntry = kd.find((k) => k.searchVolume != null && matchesBrand(k.keyword, brand, own))
    if (!ownEntry || ownEntry.searchVolume == null) return null
    const compVols = comps
      .map((c) => {
        const nd = normalizeDomain(c.domain)
        const bt = sld(c.domain)
        const cn = c.name.toLowerCase()
        const e = kd.find((k) => k.searchVolume != null && (matchesBrand(k.keyword, cn, nd) || matchesBrand(k.keyword, bt, nd)))
        return e && e.searchVolume != null ? { name: c.name, brandQuery: e.keyword, searchVolume: e.searchVolume, evidenceId: e.evidenceId } : null
      })
      .filter((x): x is { name: string; brandQuery: string; searchVolume: number; evidenceId: string } => x !== null)
    if (compVols.length === 0) return null
    const refs = dedupeRefs([ownEntry.evidenceId, ...compVols.map((c) => c.evidenceId)])
    const comparison = [
      { name: ctx.project.domain, brandQuery: ownEntry.keyword, searchVolume: ownEntry.searchVolume, you: true },
      ...compVols.map((c) => ({ name: c.name, brandQuery: c.brandQuery, searchVolume: c.searchVolume, you: false })),
    ].sort((a, b) => b.searchVolume - a.searchVolume)
    return {
      title: '品牌搜索量对比（信任代理指标）',
      description:
        '对比本站与确认竞品的品牌词月均搜索量。品牌搜索量是需求侧信任的代理指标，与 AI 可见性存在相关性（§2 r=0.664，仅相关非因果）。此项只做度量与对比展示，不下因果结论。搜索量为第三方估算。',
      evidenceRefs: refs,
      scope: 'authority:brand-volume',
      detail: { comparison, correlationalOnly: true },
    }
  },
}

export const authorityRules: Rule[] = [A01, A02, A03, G04, E02, E03]
