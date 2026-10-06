import { parseRobotsAllowed } from '@/lib/collection/robots'
import type { Rule, RuleHitDraft, RuleSeverity } from '../types'
import { checkHreflang } from './hreflang-codes'
import { analyzeCwv, lighthouseClues, ttfbConcern, TTFB_SLOW_MS } from '@/lib/collection/psi-analyze'
import { readLinkGraph } from '@/lib/crawl/link-graph'
import { isUtilityPage } from '@/lib/crawl/link-integrity'

// P1 技术健康规则组（确定性、纯函数，消费已落库证据）。
// —— 阈值均为启发式经验值，随 RULES_VERSION 版本化，非行业硬标准 ——
const HTTP_ERROR_WARN_RATIO = 0.05 // 4xx+5xx 占已检页比例的告警线
const DENIED_STATUSES = new Set([401, 403, 429]) // 拒绝访问 / 限流：多为反爬，不代表用户不可达
const HTTP_ERROR_ERROR_RATIO = 0.15 // 超过此比例升级为 error
export const RENDER_DEPENDENCY_RATIO = 0.3 // 初始正文/渲染后正文 低于此值判为渲染依赖
const KEY_PAGE_MIN_INBOUND = 3 // 关键/聚合页最低内链入度
const MAX_DEPTH = 3 // 点击深度上限：超过 3 层视为过深（权重传导与抓取效率下降）
// 静态资源扩展名：未抓取的链接目标若是这些，不当作「页面」计入 T12（独立审查复现 F）。
const ASSET_PATH = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|pdf|zip|rar|7z|gz|tar|mp4|webm|mov|avi|mp3|wav|woff2?|ttf|otf|eot|css|js|mjs|json|xml|txt|csv|xlsx?|docx?|pptx?)$/i
const isAssetUrl = (url: string) => {
  try {
    return ASSET_PATH.test(new URL(url).pathname)
  } catch {
    return false
  }
}

// 渲染依赖判定：computeMainContentDelta 语义下 delta = renderedChars - initialChars，
// 「初始 HTML 正文占渲染后正文 <30%」等价于 initialChars/renderedChars < 0.3。
// renderedChars<=0 表示渲染后也无正文，不构成「依赖 JS 才出现」，不判定。
export function isRenderDependent(rc: { initialChars: number; renderedChars: number }): boolean {
  if (rc.renderedChars <= 0) return false
  return rc.initialChars / rc.renderedChars < RENDER_DEPENDENCY_RATIO
}

// —— T15 低价值语言页泛滥（启发式阈值，随 RULES_VERSION 固化，非行业硬标准）——
const T15_MIN_LANG_CODES = 2 // 至少 2 种语言路径才判定多语言泛滥
const T15_ZERO_IMPRESSION_RATIO = 0.7 // 语言页零展示占比告警线
const T15_MIN_ZERO_PAGES = 10 // 零展示语言页绝对数下限

// ISO 639-1 语言码白名单（语言路径首段匹配用）。
const ISO_639_1_CODES = new Set([
  'aa','ab','ae','af','ak','am','an','ar','as','av','ay','az','ba','be','bg','bh','bi','bm','bn','bo','br','bs',
  'ca','ce','ch','co','cr','cs','cu','cv','cy','da','de','dv','dz','ee','el','en','eo','es','et','eu','fa','ff',
  'fi','fj','fo','fr','fy','ga','gd','gl','gn','gu','gv','ha','he','hi','ho','hr','ht','hu','hy','hz','ia','id',
  'ie','ig','ii','ik','io','is','it','iu','ja','jv','ka','kg','ki','kj','kk','kl','km','kn','ko','kr','ks','ku',
  'kv','kw','ky','la','lb','lg','li','ln','lo','lt','lu','lv','mg','mh','mi','mk','ml','mn','mr','ms','mt','my',
  'na','nb','nd','ne','ng','nl','nn','no','nr','nv','ny','oc','oj','om','or','os','pa','pi','pl','ps','pt','qu',
  'rm','rn','ro','ru','rw','sa','sc','sd','se','sg','si','sk','sl','sm','sn','so','sq','sr','ss','st','su','sv',
  'sw','ta','te','tg','th','ti','tk','tl','tn','to','tr','ts','tt','tw','ty','ug','uk','ur','uz','ve','vi','vo',
  'wa','wo','xh','yi','yo','za','zh','zu',
])

// 取 URL 或模板 pattern 的首段路径（小写、剥前导斜杠）。
function firstPathSegment(urlOrPattern: string): string {
  let path = urlOrPattern
  try {
    path = new URL(urlOrPattern).pathname
  } catch {
    // pattern 形如 '/de/{slug}'（相对路径），直接用原串
  }
  return (path.replace(/^\/+/, '').split('/')[0] ?? '').toLowerCase()
}

// 判断模板 pattern（或 URL）首段是否为语言路径（/de/*、/zh-cn/*）。
export function isLanguagePathTemplate(pattern: string): boolean {
  const first = firstPathSegment(pattern)
  if (!first) return false
  const lang = first.includes('-') ? first.split('-')[0] : first
  return ISO_639_1_CODES.has(lang)
}

function hostOf(u: string): string | null {
  try {
    return new URL(u).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

// T01：入口/关键页被 robots.txt 屏蔽（Googlebot 不可抓）。
const T01: Rule = {
  id: 'T01',
  pillar: 'P1',
  side: 'technical',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const refs: string[] = []
    const blockedUrls: string[] = []
    const blockedKeyUrls: string[] = []
    // 入口可抓性：有 robots 原文且项目域名是完整 URL 时按 Googlebot 重新判定——旧证据的 robotsAllowed 是按 * 组算的
    // （本工具爬虫的身份），重新分析旧 run 时会把白名单式 robots 误报成"Googlebot 不可抓"（最终审查 F3-1）。
    const entryPathForGooglebot = (() => {
      if (!ctx.robotsText) return null
      try {
        const u = new URL(ctx.project.domain)
        return `${u.pathname}${u.search}`
      } catch {
        return null
      }
    })()
    const entryBlocked = ctx.entryPage
      ? entryPathForGooglebot !== null && ctx.robotsText
        ? !parseRobotsAllowed(ctx.robotsText, entryPathForGooglebot, 'Googlebot')
        : ctx.entryPage.robotsAllowed === false
      : false
    if (ctx.entryPage && entryBlocked) refs.push(ctx.entryPage.id)
    const audit = ctx.siteAudit
    if (audit) {
      // 爬虫按 * 组守规则；T01 讲的是 Googlebot——有 robots 原文时按 Googlebot 复核，只留 Googlebot 也不可抓的页（最终审查 F3-1）。
      const googlebotBlocked = (url: string): boolean => {
        if (!ctx.robotsText) return true
        try {
          const u = new URL(url)
          return !parseRobotsAllowed(ctx.robotsText, `${u.pathname}${u.search}`, 'Googlebot')
        } catch {
          return true
        }
      }
      const blocked = audit.payload.pages.filter((p) => p.checkStatus === 'blocked_by_robots' && googlebotBlocked(p.url))
      if (blocked.length > 0) {
        refs.push(audit.id)
        for (const p of blocked) {
          blockedUrls.push(p.url)
          if (p.isKeyPage) blockedKeyUrls.push(p.url)
        }
      }
    }
    if (refs.length === 0) return null
    if (entryBlocked || blockedKeyUrls.length > 0) {
      return {
        title: '入口/关键页被 robots.txt 屏蔽（Googlebot 不可抓）',
        description:
          '检测到页面对 Googlebot 处于 robots.txt Disallow 状态，搜索引擎无法抓取与收录，属技术健康最高优先级问题。',
        evidenceRefs: refs,
        scope: 'site',
        detail: {
          entryBlocked,
          blockedCount: blockedUrls.length,
          blockedKeyUrls,
          blockedUrls: blockedUrls.slice(0, 10),
        },
      }
    }
    // 只有入口与重点页以外的 URL 被禁抓（如购物车、站内搜索结果页）：多为有意为之，降为 notice 提示核对（SP-A §5.2 #2）。
    return {
      title: `robots.txt 禁抓了 ${blockedUrls.length} 个 URL`,
      description: '这些 URL 对 Googlebot 处于 Disallow 状态（如购物车、搜索结果页通常属于有意为之）。请确认其中没有需要被收录的页面。',
      evidenceRefs: refs,
      scope: 'site',
      severity: 'notice',
      detail: { entryBlocked, blockedCount: blockedUrls.length, blockedKeyUrls, blockedUrls: blockedUrls.slice(0, 10) },
    }
  },
}

// T02：4xx/5xx 错误比例超阈值（比例升级 severity）。
const T02: Rule = {
  id: 'T02',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const { checked, http4xx, http5xx } = audit.payload.stats
    if (checked <= 0) return null
    // 401/403/429 多为反爬/限流对本工具请求的拒绝，不代表用户不可达，不计入错误比例（与 L01 口径一致，第二轮独立审查 #16）。
    const denied = audit.payload.pages.filter((p) => p.checkStatus === 'checked' && DENIED_STATUSES.has(p.httpStatus ?? 0)).length
    const bad = Math.max(0, http4xx + http5xx - denied)
    const ratio = bad / checked
    if (ratio <= HTTP_ERROR_WARN_RATIO) return null
    const severity: RuleSeverity = ratio > HTTP_ERROR_ERROR_RATIO ? 'error' : 'warning'
    const examples = audit.payload.pages
      .filter((p) => (p.httpStatus ?? 0) >= 400 && !DENIED_STATUSES.has(p.httpStatus ?? 0))
      .map((p) => ({ url: p.url, status: p.httpStatus }))
      .slice(0, 10)
    return {
      title: '页面 4xx/5xx 错误比例偏高',
      description: `已检 ${checked} 页中 ${bad} 页返回 4xx/5xx（占比 ${(ratio * 100).toFixed(1)}%，不含 401/403/429 等拒绝访问码），浪费抓取预算并影响用户可达性。${denied ? `另有 ${denied} 页对本工具的请求返回拒绝访问码，可能是反爬或限流，未计入。` : ''}`,
      evidenceRefs: [audit.id],
      scope: 'site',
      severity,
      detail: { checked, http4xx, http5xx, denied, ratio, examples },
    }
  },
}

// T03：noindex 误用。
const T03: Rule = {
  id: 'T03',
  pillar: 'P1',
  side: 'technical',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    // 隐私/条款/登录/购物车/站内搜索等功能页 noindex 是正常做法，不算「误用」（与 L03 口径一致，第二轮独立审查 #16）。
    const noindexPages = audit.payload.pages.filter((p) => p.checkStatus === 'checked' && (p.metaRobots ?? '').toLowerCase().includes('noindex'))
    const utility = noindexPages.filter((p) => isUtilityPage(p.url)).length
    const n = Math.max(0, audit.payload.stats.noindex - utility)
    if (n <= 0) return null
    const examples = noindexPages
      .filter((p) => !isUtilityPage(p.url))
      .map((p) => p.url)
      .slice(0, 10)
    return {
      title: '页面存在 noindex 误用',
      description: `检测到 ${n} 个已检页面带 noindex，将被搜索引擎排除收录，请确认是否为有意为之。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: n, examples },
    }
  },
}

// T04：canonical 指向站外。
const T04: Rule = {
  id: 'T04',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const n = audit.payload.stats.canonicalOffsite
    if (n <= 0) return null
    const domainHost = hostOf(`https://${ctx.project.domain}`) ?? ctx.project.domain
    const examples = audit.payload.pages
      .filter((p) => {
        if (!p.canonicalUrl) return false
        const h = hostOf(p.canonicalUrl)
        return h !== null && h !== domainHost
      })
      .map((p) => ({ url: p.url, canonical: p.canonicalUrl }))
      .slice(0, 10)
    return {
      title: 'canonical 指向站外',
      description: `检测到 ${n} 个页面的 canonical 指向本站以外域名，可能导致收录归属与权重流失。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: n, examples },
    }
  },
}

// T05：孤岛页（sitemap 声明但内链入度 0）。
const T05: Rule = {
  id: 'T05',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const n = audit.payload.stats.orphanPages
    if (n <= 0) return null
    const graph = readLinkGraph(audit.payload)
    // 入口页零站内出链：多为 JS 渲染导航，初始 HTML 抽不到链接，孤岛判定不可信（spec S1 Review Focus 1）。
    if (graph && (graph.nodeByUrl.get(graph.entryUrl)?.outInternal ?? 0) === 0) return null
    const examples = audit.payload.pages
      .filter((p) => p.discoveredVia === 'sitemap' && p.inboundLinkCount === 0 && p.checkStatus === 'checked')
      .map((p) => p.url)
      .slice(0, 10)
    // 抓取未穷尽：未抓页可能链向它，只能说「已抓范围内未发现入链」（spec S1 §8）。
    const partial = graph !== null && !graph.exhaustive
    return {
      title: '存在孤岛页（sitemap 声明但无内链入口）',
      description: partial
        ? `在已抓取的 ${audit.payload.stats.checked} 页中，有 ${n} 个 sitemap 声明的页面未发现任何内链指向（本次抓取未穷尽全站，未抓取页面可能链向它们），抓取发现与内链传权可能受限。`
        : `检测到 ${n} 个页面仅在 sitemap 中声明、站内无任何内链指向，抓取发现与内链传权受限。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: n, examples, ...(graph ? { exhaustive: graph.exhaustive } : {}) },
      ...(partial ? { claimType: 'inferred' as const } : {}),
    }
  },
}

// T07：sitemap 缺失/偏差（保守启发式：全站多页却无一页来自 sitemap）。
const T07: Rule = {
  id: 'T07',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const { totalDiscovered } = audit.payload.stats
    // 链接优先爬取（S1）下 sitemap 页多半先被链接发现，记为 both：同样来自 sitemap（2026-10-03 metadocu.com 误报）。
    const sitemapPages = audit.payload.pages.filter((p) => p.discoveredVia === 'sitemap' || p.discoveredVia === 'both').length
    // 有 sitemap 来源页 → 视为存在 sitemap，不判定；单页站点无从判定，跳过。
    if (sitemapPages > 0) return null
    if (totalDiscovered <= 1) return null
    return {
      title: '未发现有效 sitemap',
      description: `全站发现 ${totalDiscovered} 个页面，但无任何页面来自 sitemap，疑似 sitemap 缺失或未被抓取到，影响新页面发现效率。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { totalDiscovered, sitemapPages },
    }
  },
}

// T10：渲染依赖——初始 HTML 正文占渲染后 <30%（每受影响页一条）。
const T10: Rule = {
  id: 'T10',
  pillar: 'P1',
  side: 'technical',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft[] | null {
    const hits = ctx.renderChecks.filter(isRenderDependent).map<RuleHitDraft>((rc) => ({
      title: '页面正文依赖 JS 渲染（初始 HTML 缺正文）',
      description: `初始 HTML 正文 ${rc.initialChars} 字符、渲染后 ${rc.renderedChars} 字符，占比 ${((rc.initialChars / rc.renderedChars) * 100).toFixed(0)}%（<30%），不执行 JS 的抓取链路将拿不到正文。`,
      evidenceRefs: [rc.id],
      scope: rc.source,
      detail: {
        initialChars: rc.initialChars,
        renderedChars: rc.renderedChars,
        ratio: rc.initialChars / rc.renderedChars,
      },
    }))
    return hits.length ? hits : null
  },
}

// T11：关键/聚合页内链支撑不足（每页一条）。
const T11: Rule = {
  id: 'T11',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft[] | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const low = audit.payload.pages.filter(
      (p) => p.isKeyPage && p.checkStatus === 'checked' && p.inboundLinkCount < KEY_PAGE_MIN_INBOUND,
    )
    if (low.length === 0) return null
    return low.map<RuleHitDraft>((p) => ({
      title: '关键/聚合页内链支撑不足',
      description: `关键页 ${p.url} 仅有 ${p.inboundLinkCount} 条站内内链（阈值 ${KEY_PAGE_MIN_INBOUND}），权重传导与抓取优先级受限。`,
      evidenceRefs: [audit.id],
      scope: p.url,
      detail: { url: p.url, inboundLinkCount: p.inboundLinkCount, threshold: KEY_PAGE_MIN_INBOUND },
    }))
  },
}

// T12：点击深度过深（depth > 3，聚合计数 + 样例）。
const T12: Rule = {
  id: 'T12',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const graph = readLinkGraph(audit.payload)
    if (graph) {
      // 只用深度精确的节点（深度 ≤ 视界 H）。实测只给已抓取的 2xx HTML 页；未抓取的超深链接目标类型与状态
      // 未确认（可能是图片、404），单独计数且只能标 inferred（spec S1 §8 + 独立审查 P4/P7）。
      const deepExact = graph.nodes.filter((n) => n.depthExact && n.depth !== null && n.depth > MAX_DEPTH)
      const pages = deepExact.filter((n) => n.html)
      const unfetched = deepExact.filter((n) => !n.fetched && !isAssetUrl(n.url))
      if (pages.length === 0 && unfetched.length === 0) return null
      const upperBoundDeepCount = graph.nodes.filter(
        (n) => !n.depthExact && n.depth !== null && n.depth > MAX_DEPTH && (n.html || (!n.fetched && !isAssetUrl(n.url))),
      ).length
      const measured = pages.length > 0
      const shown = measured ? pages : unfetched
      const examples = [...shown]
        .sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))
        .slice(0, 10)
        .map((n) => ({ url: n.url, depth: n.depth, fetched: n.fetched }))
      return {
        title: '页面点击深度过深',
        description: measured
          ? `在本次抓取的链接图内，${pages.length} 个已抓取页面从首页出发、沿搜索引擎可跟随链接的最短路径超过 ${MAX_DEPTH} 层（仅统计可精确测定深度的页面）${unfetched.length ? `；另有 ${unfetched.length} 个未抓取的链接目标同样超过 ${MAX_DEPTH} 层` : ''}。权重传导与抓取效率随深度递减，重点页应压到 ${MAX_DEPTH} 层内。`
          : `在本次抓取的链接图内，有 ${unfetched.length} 个链接目标位于首页出发、沿搜索引擎可跟随链接的第 ${MAX_DEPTH + 1} 层及更深（受抓取深度上限未抓取，页面类型与状态未确认）。重点页应压到 ${MAX_DEPTH} 层内。`,
        evidenceRefs: [audit.id],
        scope: 'site',
        detail: {
          maxDepth: MAX_DEPTH, count: shown.length, measuredPageCount: pages.length, unfetchedDeepCount: unfetched.length,
          upperBoundDeepCount, examples, exactDepthHorizon: graph.exactDepthHorizon, closureComplete: graph.closureComplete,
        },
        ...(measured ? {} : { claimType: 'inferred' as const }),
      }
    }
    // 历史证据无图谱：回退爬虫深度（旧口径）。
    const deep = audit.payload.pages.filter((p) => p.depth != null && p.depth > MAX_DEPTH)
    if (deep.length === 0) return null
    const examples = deep.map((p) => ({ url: p.url, depth: p.depth })).slice(0, 10)
    return {
      title: '页面点击深度过深',
      description: `检测到 ${deep.length} 个页面点击深度超过 ${MAX_DEPTH} 层，权重传导与抓取效率随深度递减，重点页应压到 ${MAX_DEPTH} 层内。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { maxDepth: MAX_DEPTH, count: deep.length, examples },
    }
  },
}

// —— 轻检扩展字段规则组（消费 siteAudit.payload.pages[].lightCheckExtra；旧证据无此字段则跳过该页）——
const C09_ALT_MISSING_RATIO = 0.3 // 站级图片 alt 缺失率告警线（启发式）
const SCANNABILITY_PARA_WORDS = 150 // 平均段落词数上限，超过判为不易扫描（启发式）

// 逐页内容规则只看成功返回的 HTML 页：PDF/图片/feed 与 404/429 等错误页没有 viewport、alt 可言
// （2026-10-03 真实站点冒烟：PDF 与限流页被报成缺 viewport）。历史证据无 contentKind/httpStatus 时照旧计入。
const pagesWithExtra = (ctx: Parameters<Rule['evaluate']>[0]) =>
  (ctx.siteAudit?.payload.pages ?? [])
    .filter((p) => p.checkStatus === 'checked' && p.lightCheckExtra)
    .filter((p) => (p.lightCheckExtra!.contentKind ?? 'html') === 'html' && (p.httpStatus == null || (p.httpStatus >= 200 && p.httpStatus < 300)))
    .map((p) => ({ url: p.url, x: p.lightCheckExtra! }))

// T06：重定向（跳转链/循环的方向性信号——本期仅凭 redirected 标志，非完整链路追踪）。
const T06: Rule = {
  id: 'T06',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const redirected = pagesWithExtra(ctx).filter((p) => p.x.redirected)
    if (redirected.length === 0) return null
    return {
      title: '存在页面跳转（重定向）',
      description: `检测到 ${redirected.length} 个页面发生重定向；过多跳转消耗抓取预算，长链/循环会稀释权重，建议核对是否可直连目标地址。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: redirected.length, examples: redirected.map((p) => p.url).slice(0, 10) },
    }
  },
}

// T08：HTTPS / 混合内容（http 页或 https 页上引用 http:// 资源）。
const T08: Rule = {
  id: 'T08',
  pillar: 'P1',
  side: 'technical',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const bad = pagesWithExtra(ctx).filter((p) => !p.x.isHttps || p.x.mixedContentCount > 0)
    if (bad.length === 0) return null
    const nonHttps = bad.filter((p) => !p.x.isHttps).length
    return {
      title: 'HTTPS 缺失或混合内容',
      description: `检测到 ${bad.length} 个页面存在协议问题（其中 ${nonHttps} 个非 HTTPS，其余为 https 页引用了 http:// 资源）；混合内容触发浏览器拦截并损害信任与索引。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: bad.length, nonHttps, examples: bad.map((p) => p.url).slice(0, 10) },
    }
  },
}

// T13：移动端适配缺失（viewport meta 缺失）——移动优先索引下为必查项。
const T13: Rule = {
  id: 'T13',
  pillar: 'P1',
  side: 'technical',
  severity: 'error',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const noViewport = pagesWithExtra(ctx).filter((p) => !p.x.hasViewport)
    if (noViewport.length === 0) return null
    return {
      title: '移动端适配缺失（无 viewport）',
      description: `检测到 ${noViewport.length} 个页面缺少 viewport meta 标签；移动优先索引下会直接影响移动端可用性与排名。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { count: noViewport.length, examples: noViewport.map((p) => p.url).slice(0, 10) },
    }
  },
}

// T14：hreflang 检查组（仅在存在 hreflang 声明的多语言站触发；单语言站跳过）。
const T14: Rule = {
  id: 'T14',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const withHreflang = pagesWithExtra(ctx).filter((p) => p.x.hreflangEntries.length > 0)
    if (withHreflang.length === 0) return null // 单语言站：无 hreflang，跳过

    // 按 BCP 47 子集逐个校验（SP-A §5.2 #1：语言 ISO 639-1 [-文字] [-地区 ISO 3166-1 alpha-2]，代码表见 hreflang-codes.ts）。
    const invalidCodes: string[] = []
    const suggestions: Record<string, string> = {}
    let hasXDefault = false
    for (const p of withHreflang) {
      for (const e of p.x.hreflangEntries) {
        if (e.hreflang.trim().toLowerCase() === 'x-default') { hasXDefault = true; continue }
        const check = checkHreflang(e.hreflang)
        if (!check.ok) {
          invalidCodes.push(e.hreflang)
          if (check.suggestion) suggestions[e.hreflang] = check.suggestion
        }
      }
    }
    const problems: string[] = []
    if (invalidCodes.length) problems.push(`无效语言-地区代码 ${[...new Set(invalidCodes)].join('、')}（如 en-uk 应为 en-gb）`)
    if (!hasXDefault) problems.push('缺少 x-default 声明')
    if (problems.length === 0) return null
    return {
      title: 'hreflang 配置存在问题',
      description: `多语言站的 hreflang 声明存在问题：${problems.join('；')}。错误的 hreflang 会导致错误地区版本被索引。`,
      evidenceRefs: [audit.id],
      scope: 'site',
      detail: { invalidCodes: [...new Set(invalidCodes)], suggestions, hasXDefault, affectedPages: withHreflang.length },
    }
  },
}

// T15：低价值语言页泛滥（语言路径模板 × GSC 零展示交叉）。
// 「低价值」核心证据是 GSC 零展示实测，无 GSC 不可验证 → 整条 no-op（宁缺毋滥）。
const T15: Rule = {
  id: 'T15',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const audit = ctx.siteAudit
    if (!audit) return null
    const gscEvidenceId = ctx.queryPageMetrics.find((m) => m.evidenceId)?.evidenceId
    if (!gscEvidenceId) return null // 无 GSC：不可验证「低价值」

    const langCodes = new Set(
      audit.payload.templates
        .filter((t) => isLanguagePathTemplate(t.pattern))
        .map((t) => {
          const first = firstPathSegment(t.pattern)
          return first.includes('-') ? first.split('-')[0] : first
        }),
    )
    if (langCodes.size < T15_MIN_LANG_CODES) return null

    const langPages = audit.payload.pages.filter((p) => isLanguagePathTemplate(p.url))
    if (langPages.length === 0) return null

    const stripSlash = (u: string) => u.replace(/\/$/, '')
    const impressed = new Set(
      ctx.queryPageMetrics.filter((m) => m.impressions > 0).map((m) => stripSlash(m.page)),
    )
    const zeroPages = langPages.filter((p) => !impressed.has(stripSlash(p.url)))
    const zeroRatio = zeroPages.length / langPages.length
    if (zeroPages.length < T15_MIN_ZERO_PAGES || zeroRatio < T15_ZERO_IMPRESSION_RATIO) return null

    return {
      title: '低价值语言页泛滥',
      description: `识别到 ${langCodes.size} 种语言路径下共 ${zeroPages.length} 页在 GSC 近 90 天零展示（占语言页 ${Math.round(zeroRatio * 100)}%），疑似翻译插件批量生成、耗抓取预算并稀释权重（推断）。`,
      evidenceRefs: [audit.id, gscEvidenceId],
      scope: 'site',
      detail: {
        langCodes: [...langCodes],
        langPageCount: langPages.length,
        zeroImpressionCount: zeroPages.length,
        zeroRatio: Number(zeroRatio.toFixed(2)),
        sampleUrls: zeroPages.slice(0, 5).map((p) => p.url),
      },
    }
  },
}

// —— P1 性能检查组 T09a-c（证据源：PSI）。定级见 spec §「性能检查组定位说明」 ——
// CWV 指标展示格式：LCP/INP 为毫秒（取整），CLS 为比值（3 位小数）。
function fmtCwv(metric: string, value: number): string {
  return metric === 'CLS' ? value.toFixed(3) : `${Math.round(value)}ms`
}

// T09a：CWV 字段数据（CrUX，真实用户）未达标。仅在有字段数据时产出 → measured_hard（L4）。
const T09a: Rule = {
  id: 'T09a',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const refs: string[] = []
    const failing: { metric: string; value: number; strategy: string }[] = []
    for (const c of ctx.psiChecks) {
      const fails = analyzeCwv(c.result).filter((m) => !m.passes)
      if (fails.length) {
        refs.push(c.id)
        for (const f of fails) failing.push({ metric: f.metric, value: f.value, strategy: f.strategy })
      }
    }
    if (failing.length === 0) return null
    return {
      title: 'Core Web Vitals 字段数据未达标（真实用户）',
      description: `CrUX 真实用户数据存在未达标的核心网页指标（${failing
        .map((f) => `${f.metric} ${fmtCwv(f.metric, f.value)} @${f.strategy}`)
        .join('、')}），影响页面体验信号与移动优先索引下的可见性。`,
      evidenceRefs: refs,
      scope: 'site',
      detail: { failing },
    }
  },
}

// T09b：Lighthouse 实验室修复线索。恒标「实验室模拟，非排名输入」→ notice / inferred。
const T09b: Rule = {
  id: 'T09b',
  pillar: 'P1',
  side: 'technical',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const refs: string[] = []
    const byTitle = new Map<string, number | undefined>() // title → 最大 savingsMs
    for (const c of ctx.psiChecks) {
      const top = lighthouseClues(c.result, 5)
      if (top.length) refs.push(c.id)
      for (const t of top) {
        const prev = byTitle.get(t.title)
        const next = t.savingsMs
        if (!byTitle.has(t.title) || (next ?? 0) > (prev ?? 0)) byTitle.set(t.title, next)
      }
    }
    if (byTitle.size === 0) return null
    const clues: { title: string; savingsMs?: number }[] = [...byTitle.entries()]
      .map(([title, savingsMs]) => (savingsMs !== undefined ? { title, savingsMs } : { title }))
      .sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0))
      .slice(0, 8)
    return {
      title: '性能修复线索（Lighthouse 实验室模拟，非 Google 排名输入）',
      description:
        '基于 Lighthouse 实验室审计的 top 优化机会，作为 CWV 改进的修复清单。Lighthouse 分数为实验室模拟值，Google 排名不使用该分数，仅作诊断参考。',
      evidenceRefs: refs,
      scope: 'site',
      detail: { clues },
    }
  },
}

// T09c：服务器响应过慢（TTFB > 阈值）影响抓取效率。有 CrUX 时 measured_hard，否则降 inferred（spec 降级链）。
const T09c: Rule = {
  id: 'T09c',
  pillar: 'P1',
  side: 'technical',
  severity: 'warning',
  claimType: 'measured_hard',
  evaluate(ctx): RuleHitDraft | null {
    const refs: string[] = []
    let worstTtfb = 0
    let anyFieldData = false
    for (const c of ctx.psiChecks) {
      const t = ttfbConcern(c.result)
      if (t?.slow) {
        refs.push(c.id)
        worstTtfb = Math.max(worstTtfb, t.ttfbMs)
        if (c.result.crux.hasFieldData) anyFieldData = true
      }
    }
    if (refs.length === 0) return null
    return {
      title: '服务器响应过慢，影响抓取效率',
      description: `检测到服务器响应时间偏慢（TTFB 约 ${Math.round(worstTtfb)}ms，超过 ${TTFB_SLOW_MS}ms 阈值）。Google 官方指引：响应速度影响抓取预算与抓取速率，进而影响收录覆盖与时效，对大站尤甚。`,
      evidenceRefs: refs,
      scope: 'site',
      // 无 CrUX 字段数据时，性能对排名的实测依据不足，claim 上限降为 inferred（spec §性能降级链）。
      claimType: anyFieldData ? 'measured_hard' : 'inferred',
      detail: { ttfbMs: Math.round(worstTtfb) },
    }
  },
}

export const technicalRules: Rule[] = [T01, T02, T03, T04, T05, T06, T07, T08, T10, T11, T12, T13, T14, T15, T09a, T09b, T09c]

// C09/C11 复用轻检扩展的取数逻辑（内容支柱，但证据同为 site_audit 轻检）。
export { pagesWithExtra, C09_ALT_MISSING_RATIO, SCANNABILITY_PARA_WORDS }
