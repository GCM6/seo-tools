import type { RuleDef, RuleContext, RuleHitDraft } from '../types'
import { analyzeLinkIntegrity, type LinkIntegrity, type TargetRow } from '@/lib/crawl/link-integrity'
import type { LinkGraphEdge } from '@/lib/crawl/link-graph'

// 链接完整性规则组 L01–L07（spec 2026-09-29-s2-link-integrity §3）。
// 全部计算在 analyzeLinkIntegrity（与站点结构页同源）；这里只把清单格式化成命中。
// 公共守卫在分析层：无图谱（历史证据）/ 入口零站内出链 → null，规则整组 no-op。

const MAX_EXAMPLES = 10
const MAX_SOURCES = 3
const SITEWIDE_REGIONS = new Set(['nav', 'header', 'footer'])
const L01_ERROR_SOURCES = 5 // 单个断链目标被 ≥5 个页面链接 → 升 error

function integrity(ctx: RuleContext): { auditId: string; li: LinkIntegrity } | null {
  const audit = ctx.siteAudit
  if (!audit) return null
  const li = analyzeLinkIntegrity(audit.payload)
  return li ? { auditId: audit.id, li } : null
}

// 经跳转的链接带上页面里实际写的地址（redirectedFrom），否则用户按目标 URL 在源码里找不到（第二轮独立审查 #3）。
const sourcesOf = (edges: LinkGraphEdge[]) =>
  edges.slice(0, MAX_SOURCES).map((e) => ({ from: e.from, anchor: e.anchors[0] ?? '', regions: e.regions, ...(e.redirectedFrom ? { linkedAs: e.redirectedFrom } : {}) }))

const targetExamples = (rows: TargetRow[], extra: (r: TargetRow) => Record<string, unknown>) =>
  rows.slice(0, MAX_EXAMPLES).map((r) => ({ url: r.url, ...extra(r), sourceCount: r.edges.length, sources: sourcesOf(r.edges) }))

const linkTotal = (rows: TargetRow[]) => rows.reduce((s, r) => s + r.edges.length, 0)

const L01: RuleDef = {
  id: 'L01',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const got = integrity(ctx)
    if (!got || got.li.broken.length === 0) return null
    const { broken, unverifiedTargets, errorTargets } = got.li
    const links = linkTotal(broken)
    const sitewide = broken.some((r) => r.edges.some((e) => e.regions.some((g) => SITEWIDE_REGIONS.has(g))))
    const heavy = broken.some((r) => r.edges.length >= L01_ERROR_SOURCES)
    const loops = broken.filter((r) => r.reason === 'redirect_loop').length
    const notFound = broken.length - loops
    const what = [notFound ? `${notFound} 个返回 404/410` : '', loops ? `${loops} 个陷入重定向循环（浏览器显示「重定向次数过多」）` : ''].filter(Boolean).join('、')
    return {
      title: loops ? '存在站内断链（链接指向 404/410 页面或重定向循环）' : '存在站内断链（链接指向 404/410 页面）',
      description: `本次抓取中有 ${broken.length} 个站内 URL 打不开：${what}；共 ${links} 条站内链接指向它们${sitewide ? '（含导航/页眉/页脚中的全站链接）' : ''}。访客与抓取器点击这些链接会进入错误页。${errorTargets ? `另有 ${errorTargets} 个被链接的 URL 返回其他错误（如 403/429/5xx 或超时，可能是反爬或临时故障），未计入。` : ''}`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      severity: sitewide || heavy ? 'error' : 'warning',
      detail: {
        brokenTargets: broken.length, brokenLinks: links, redirectLoops: loops, sitewide, unverifiedTargets, errorTargets,
        examples: targetExamples(broken, (r) => ({ httpStatus: r.httpStatus, ...(r.reason ? { reason: r.reason } : {}) })),
      },
    }
  },
}

const L02: RuleDef = {
  id: 'L02',
  pillar: 'P1',
  side: 'technical',
  severity: 'notice',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const got = integrity(ctx)
    if (!got || got.li.redirects.length === 0) return null
    const { redirects } = got.li
    return {
      title: '内链指向会跳转的 URL',
      description: `${redirects.length} 个站内链接目标会跳转到其他地址（共 ${linkTotal(redirects)} 条内链），每次点击都多一跳重定向；应把链接直接改成最终地址。`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: { count: redirects.length, links: linkTotal(redirects), examples: targetExamples(redirects, (r) => ({ finalUrl: r.finalUrl })) },
    }
  },
}

const L03: RuleDef = {
  id: 'L03',
  pillar: 'P1',
  side: 'technical',
  severity: 'notice',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const got = integrity(ctx)
    if (!got || got.li.nonIndexable.length === 0) return null
    const rows = got.li.nonIndexable
    return {
      title: '内链指向不可收录的页面（noindex 或 canonical 指向他页）',
      description: `${rows.length} 个被可跟随内链指向的页面自身标记为 noindex，或 canonical 指向本站其他 URL（共 ${linkTotal(rows)} 条内链）。这些链接把权重送给了不参与排名的页面；若为有意设计（如分页、筛选页）可忽略。`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: { count: rows.length, links: linkTotal(rows), examples: targetExamples(rows, (r) => ({ reason: r.reason })) },
    }
  },
}

const L04: RuleDef = {
  id: 'L04',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const got = integrity(ctx)
    if (!got || got.li.islands.length === 0) return null
    const { islands, islandsExact } = got.li
    // 抓取未覆盖首页可达的全部页面时，「到不了」只能说「在已抓范围内没找到路径」（spec S2 §3）。
    return {
      title: '存在首页不可达的页面（孤岛群）',
      description: islandsExact
        ? `${islands.length} 个 sitemap 中列出（含经跳转指向）的页面有站内链接互相指向，但从首页出发沿任何站内 HTML 链接都无法到达。抓取器只能靠 sitemap 发现它们，内链权重也传不进来。`
        : `在已抓取范围内，${islands.length} 个 sitemap 中列出（含经跳转指向）的页面未发现从首页出发的站内链接路径（本次抓取未覆盖首页可达的全部页面，结论仅限已抓范围）。`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: { count: islands.length, exact: islandsExact, examples: islands.slice(0, MAX_EXAMPLES) },
      ...(islandsExact ? {} : { claimType: 'inferred' as const }),
    }
  },
}

const L05: RuleDef = {
  id: 'L05',
  pillar: 'P1',
  side: 'technical',
  severity: 'notice',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const got = integrity(ctx)
    if (!got || got.li.nofollowOnly.length === 0) return null
    const { nofollowOnly, nofollowOnlyExact, graph } = got.li
    const examples = nofollowOnly.slice(0, MAX_EXAMPLES).map((url) => ({
      url,
      via: graph.edges.filter((e) => e.to === url && !e.followable).slice(0, MAX_SOURCES).map((e) => ({ from: e.from, anchor: e.anchors[0] ?? '' })),
    }))
    return {
      title: '部分页面只能经 nofollow 链接到达',
      description: nofollowOnlyExact
        ? `${nofollowOnly.length} 个页面只能通过带 nofollow/ugc/sponsored 的链接（或 meta nofollow 页面上的链接）到达，搜索引擎通常不沿这类链接发现页面。`
        : `在已抓取范围内，${nofollowOnly.length} 个页面只发现经 nofollow 类链接到达的路径（本次抓取未覆盖首页可达的全部页面，结论仅限已抓范围）。`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: { count: nofollowOnly.length, exact: nofollowOnlyExact, examples },
      ...(nofollowOnlyExact ? {} : { claimType: 'inferred' as const }),
    }
  },
}

const L06: RuleDef = {
  id: 'L06',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const got = integrity(ctx)
    if (!got || got.li.deadEnds.length === 0) return null
    const { deadEnds } = got.li
    return {
      title: '存在死胡同页（初始 HTML 中无任何站内链接）',
      description: `${deadEnds.length} 个页面的初始 HTML 中没有任何站内链接，访客与抓取器到达后无路可走；若这些页面的导航由 JS 渲染也会出现此现象，可结合渲染检测（T10）判断。`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: { count: deadEnds.length, examples: deadEnds.slice(0, MAX_EXAMPLES) },
    }
  },
}

const L07: RuleDef = {
  id: 'L07',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const got = integrity(ctx)
    if (!got || got.li.externalBroken.length === 0) return null
    const { externalBroken, externalUnverified } = got.li
    return {
      title: '站外链接失效（404/410）',
      description: `抽检的站外链接中有 ${externalBroken.length} 个返回 404/410（单次检测）${externalUnverified ? `；另有 ${externalUnverified} 个返回其他错误，可能是临时故障或反爬，未计入` : ''}。`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: {
        count: externalBroken.length,
        unverified: externalUnverified,
        examples: externalBroken.slice(0, MAX_EXAMPLES).map((b) => ({
          url: b.url, status: b.status,
          sources: b.sources.slice(0, MAX_SOURCES).map((x) => ({ from: x.from, anchor: x.anchor, region: x.region })),
        })),
      },
    }
  },
}

export const linkRules: RuleDef[] = [L01, L02, L03, L04, L05, L06, L07]
