import type { Rule, RuleContext, RuleHitDraft } from '../types'
import type { SiteAuditPage } from '@/lib/crawl/site-audit'
import { registrableDomain, safeDecode, type ArticleSignals } from '@/lib/crawl/article-signals'
import { readLinkGraph, type LinkGraphView } from '@/lib/crawl/link-graph'
import { detectSocialProfiles, socialPlatformOf, type SocialPlatform } from '@/lib/crawl/social-links'
import { ORG_TYPES } from './geo'

// 文章级 E-E-A-T 与数据支撑 AR01–AR05、信任页 TR06、站内社媒主页 SO01/SO02（spec 2026-09-29-s4 §5）。
// E-E-A-T 信号都是代理指标，非 Google 官方排名因子。第三轮独立审查后全部标 inferred：「文章」集合、作者/日期/数据识别、
// 信任页与社媒主页识别都是启发式（8 个真实站点上文章判定曾仅 39% 精确率）。

const MIN_ARTICLES = 3
const MAX_EXAMPLES = 10
const PROXY_NOTE = '这些是可信度的代理指标，并非 Google 官方排名因子。'

type ArticlePage = { url: string; article: ArticleSignals }

// 文章页集合：快照中已抓 200、带文章信号且判定为文章的页；跳转合并后去重。
export function articlePagesOf(pages: SiteAuditPage[] | undefined): ArticlePage[] {
  const out = new Map<string, ArticlePage>()
  for (const p of pages ?? []) {
    const article = p.lightCheckExtra?.article
    if (p.checkStatus !== 'checked' || p.httpStatus !== 200 || !article?.isArticle) continue
    const key = p.finalUrl ?? p.url
    if (!out.has(key)) out.set(key, { url: key, article })
  }
  return [...out.values()]
}

function articlesOf(ctx: RuleContext): { auditId: string; articles: ArticlePage[] } | null {
  const audit = ctx.siteAudit
  if (!audit) return null
  const articles = articlePagesOf(audit.payload.pages)
  return articles.length >= MIN_ARTICLES ? { auditId: audit.id, articles } : null
}

function shareRule(opts: {
  id: string
  severity: 'notice' | 'warning'
  claimType: 'measured_hard' | 'inferred'
  population?: (a: ArticleSignals) => boolean
  minPopulation?: number
  isBad: (a: ArticleSignals) => boolean
  threshold: number
  title: string
  describe: (bad: number, total: number) => string
  extraDetail?: (bad: ArticlePage[]) => Record<string, unknown>
}): Rule {
  return {
    id: opts.id,
    pillar: 'P2',
    side: 'seo',
    severity: opts.severity,
    claimType: opts.claimType,
    evaluate(ctx): RuleHitDraft | null {
      const got = articlesOf(ctx)
      if (!got) return null
      const population = got.articles.filter((p) => (opts.population ? opts.population(p.article) : true))
      if (population.length < (opts.minPopulation ?? MIN_ARTICLES)) return null
      const bad = population.filter((p) => opts.isBad(p.article))
      if (bad.length / population.length < opts.threshold) return null
      return {
        title: opts.title,
        description: opts.describe(bad.length, population.length),
        evidenceRefs: [got.auditId],
        scope: 'site',
        detail: {
          articleCount: population.length,
          ...(opts.id === 'AR04' ? { unsupportedCount: bad.length } : { missingCount: bad.length }),
          share: Number((bad.length / population.length).toFixed(2)),
          sampleUrls: bad.slice(0, MAX_EXAMPLES).map((p) => p.url),
          ...(opts.extraDetail ? opts.extraDetail(bad) : {}),
        },
      }
    },
  }
}

const AR01 = shareRule({
  id: 'AR01', severity: 'notice', claimType: 'inferred', threshold: 0.5,
  isBad: (a) => !a.author,
  title: '文章缺少作者署名',
  describe: (bad, total) => `识别出的 ${total} 篇文章中有 ${bad} 篇未检测到作者署名（结构化数据、meta、rel=author、署名元素或作者页链接）。文章与署名均为启发式识别；${PROXY_NOTE}`,
})

const AR02 = shareRule({
  id: 'AR02', severity: 'notice', claimType: 'inferred', threshold: 0.7,
  population: (a) => !!a.author,
  isBad: (a) => !a.authorUrl,
  title: '文章作者缺少作者页',
  describe: (bad, total) => `${total} 篇有署名的文章中，${bad} 篇的作者没有链接到作者介绍页。作者页是展示作者经验与资历的常见载体；${PROXY_NOTE}`,
})

const AR03 = shareRule({
  id: 'AR03', severity: 'notice', claimType: 'inferred', threshold: 0.5,
  isBad: (a) => !a.datePublished && !a.dateModified,
  title: '文章缺少发布或更新日期',
  describe: (bad, total) => `识别出的 ${total} 篇文章中有 ${bad} 篇未检测到可见或结构化的发布/更新日期，读者与搜索引擎难以判断内容时效。日期识别为启发式；${PROXY_NOTE}`,
})

// AR04：用户追加需求「博客数据支撑」的核心。只有「带归属语的数据」与「正文来源链接」算支撑，孤立数字不算。
const AR04 = shareRule({
  id: 'AR04', severity: 'warning', claimType: 'inferred', threshold: 0.5,
  isBad: (a) => a.stats.attributed === 0 && a.citations.total === 0,
  title: '文章缺少数据支撑与来源引用',
  describe: (bad, total) =>
    `${total} 篇文章中有 ${bad} 篇未检测到带来源说明的数据（如「据…统计」「according to」）或正文中的外部来源链接。识别基于正文文字与链接，图片、图表中的数据识别不到；有数据和来源的内容更容易被读者信任、被 AI 答案引用（机制性推断）。`,
  extraDetail: (bad) => ({ isolatedStats: bad.reduce((s, p) => s + p.article.stats.total, 0) }),
})

const AR05 = shareRule({
  id: 'AR05', severity: 'notice', claimType: 'inferred', threshold: 0.7,
  population: (a) => a.citations.total > 0,
  isBad: (a) => a.citations.authoritative === 0,
  title: '文章引用来源的权威性不足',
  describe: (bad, total) =>
    `${total} 篇带外部引用的文章中，${bad} 篇没有引用政府、教育科研、国际组织或公认数据/学术来源。权威来源名单是启发式的，仅作方向参考。`,
})

// —— TR06：信任页（关于/联系/隐私/条款）——
// 判断「在不在」：路径词元（含拼音、德/法/西语、连写）或入链锚文本命中即算；只认已抓到的 200 页与同一家主站上的链接。
// 与 L03/T03 的功能页排除方向相反：那边判断「排除谁」，用精确段名以免误伤正常内容页。
// 识别是启发式，「缺失」一律 inferred（第三轮独立审查 P1-5：三一 /introduction、江淮 /yinsizhengce 曾被误报）。
type TrustCategory = 'about' | 'contact' | 'privacy' | 'terms'
const TRUST_TOKENS: Record<TrustCategory, Set<string>> = {
  about: new Set(['about', 'aboutus', 'about-us', 'who-we-are', 'our-story', 'company', 'introduction', 'intro', 'profile', 'guanyu', 'guanyuwomen', 'gywm', 'impressum', 'uber-uns', 'ueber-uns', 'qui-sommes-nous', 'quienes-somos', 'sobre-nosotros', 'propos', 'apropos', 'acerca', 'nosotros', 'chi-siamo', 'unternehmen', '关于我们', '公司简介']),
  contact: new Set(['contact', 'contactus', 'contact-us', 'lianxi', 'lianxiwomen', 'lxwm', 'kontakt', 'contacto', 'contato', 'nous-contacter', '联系我们']),
  privacy: new Set(['privacy', 'privacypolicy', 'privacy-policy', 'yinsi', 'yinsizhengce', 'datenschutz', 'confidentialite', 'privacidad', '隐私政策']),
  terms: new Set(['terms', 'tos', 'conditions', 'termsofservice', 'termsofuse', 'legal', 'agb', 'impressum', 'mentions-legales', 'aviso-legal', 'flsm', 'falvshengming', 'mianzeshengming', '服务条款', '法律声明', '用户协议']),
}
const TRUST_ANCHORS: Record<TrustCategory, RegExp> = {
  about: /关于|公司简介|企业简介|集团简介|公司介绍|企业介绍|走进|\babout\b|who we are|our story|impressum|über uns|qui sommes|quiénes somos/i,
  contact: /联系|\bcontact\b|kontakt|contacto|contato|nous contacter/i,
  privacy: /隐私|\bprivacy\b|datenschutz|confidentialité|privacidad/i,
  terms: /条款|服务协议|用户协议|使用协议|法律声明|免责声明|\bterms\b|conditions|\bagb\b|\blegal\b|mentions légales|aviso legal/i,
}
const TRUST_ORDER: TrustCategory[] = ['about', 'contact', 'privacy', 'terms']
const CONTACT_REGIONS = new Set(['header', 'footer', 'nav'])

const segmentsOf = (url: string) => {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).map(safeDecode)
  } catch {
    return []
  }
}
const pathMatches = (url: string, c: TrustCategory) =>
  segmentsOf(url).some((seg) => {
    const s = seg.toLowerCase().replace(/\.(html?|php|aspx?|shtml)$/, '')
    return TRUST_TOKENS[c].has(s) || s.split(/[-_]/).some((t) => TRUST_TOKENS[c].has(t))
  })

function graphOf(ctx: RuleContext): { auditId: string; graph: LinkGraphView } | null {
  const audit = ctx.siteAudit
  if (!audit) return null
  const graph = readLinkGraph(audit.payload)
  if (!graph || (graph.nodeByUrl.get(graph.entryUrl)?.outInternal ?? 0) === 0) return null
  return { auditId: audit.id, graph }
}

const TR06: Rule = {
  id: 'TR06',
  pillar: 'P2',
  side: 'seo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const got = graphOf(ctx)
    if (!got) return null
    const { graph } = got
    const anchorsTo = new Map<string, string[]>()
    for (const e of graph.edges) anchorsTo.set(e.to, [...(anchorsTo.get(e.to) ?? []), ...e.anchors])
    // 同一家的主站（blog.x.com 链到 www.x.com/about）上的信任页也算（真实站点 Cloudflare 博客冒烟发现）。
    const siteDomain = registrableDomain(new URL(graph.entryUrl).hostname)
    const sameOrgExternal = graph.external.filter((x) => registrableDomain(x.host) === siteDomain)
    const missing: TrustCategory[] = []
    const unreachable: TrustCategory[] = []
    const broken: TrustCategory[] = []
    // 页眉/页脚/导航里的邮箱或电话链接（入口页任意位置）同样提供了联系方式（2026-10-03 metadocu.com：页脚只有 mailto）。
    const contactLinked = (ctx.siteAudit?.payload.pages ?? []).some((p) =>
      (p.lightCheckExtra?.contactLinks ?? []).some((c) => CONTACT_REGIONS.has(c.region) || (graph.aliases.get(p.url) ?? p.url) === graph.entryUrl),
    )
    for (const c of TRUST_ORDER) {
      if (c === 'contact' && contactLinked) continue
      const matched = graph.nodes.filter((n) => n.url !== graph.entryUrl && (pathMatches(n.url, c) || (anchorsTo.get(n.url) ?? []).some((a) => TRUST_ANCHORS[c].test(a))))
      const ok = matched.filter((n) => n.html && n.httpStatus === 200)
      const external = sameOrgExternal.filter((x) => pathMatches(x.url, c) || TRUST_ANCHORS[c].test(x.anchor))
      if (ok.length === 0 && external.length === 0) {
        // 只找到返回错误的页面：信任页链接坏了；否则就是没找到
        ;(matched.some((n) => n.fetched && (n.httpStatus ?? 0) >= 400) ? broken : missing).push(c)
        continue
      }
      const reachable = ok.some((n) => n.depth !== null) || external.some((x) => graph.nodeByUrl.get(x.from)?.depth != null)
      if (!reachable) unreachable.push(c)
    }
    if (missing.length + unreachable.length + broken.length === 0) return null
    const parts = [
      missing.length ? `未发现${missing.map(label).join('、')}页` : '',
      broken.length ? `${broken.map(label).join('、')}页的链接返回错误状态码` : '',
      unreachable.length ? `${unreachable.map(label).join('、')}页存在但首页沿可跟随链接到不了` : '',
    ].filter(Boolean)
    return {
      title: '关于/联系/隐私/条款等信任页缺失或不可用',
      description: `在已抓取的页面中，${parts.join('；')}（按路径与链接文字启发式识别）。这些页面帮助访客确认经营主体与联系方式；${PROXY_NOTE}`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: { missing, broken, unreachable, exhaustive: graph.exhaustive, closureComplete: graph.closureComplete },
    }
  },
}
const label = (c: string) => ({ about: '关于我们', contact: '联系方式', privacy: '隐私政策', terms: '服务条款' })[c] ?? c

// —— SO01 / SO02：站内社媒主页链接 ——
const SO01: Rule = {
  id: 'SO01',
  pillar: 'P5',
  side: 'geo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const got = graphOf(ctx)
    if (!got) return null
    const fetched = got.graph.nodes.filter((n) => n.html).length
    if (fetched === 0 || detectSocialProfiles(got.graph.external, { fetchedPages: fetched }).length > 0) return null
    // 中文站常只在页脚放公众号二维码图片（不是链接）：有这类线索时不报（第三轮独立审查 P1-4）。
    if ((ctx.siteAudit?.payload.pages ?? []).some((p) => p.lightCheckExtra?.socialQrHint)) return null
    return {
      title: '站内未链接任何社媒主页',
      description: `已抓取的 ${fetched} 个页面的页眉、页脚、导航中未发现指向 LinkedIn、YouTube、微博、知乎、公众号等社媒主页的链接（分享按钮与正文引用不算，按链接形态启发式识别）。在页脚或关于页链接官方社媒主页，便于访客与搜索/AI 引擎把站点和品牌账号对应起来。`,
      evidenceRefs: [got.auditId],
      scope: 'site',
      detail: { fetchedPages: fetched, exhaustive: got.graph.exhaustive },
    }
  },
}

const SO02: Rule = {
  id: 'SO02',
  pillar: 'P5',
  side: 'geo',
  severity: 'notice',
  claimType: 'inferred',
  evaluate(ctx): RuleHitDraft | null {
    const got = graphOf(ctx)
    if (!got) return null
    const orgSchemas = ctx.schemas.filter((s) => s.types.some((t) => (ORG_TYPES as readonly string[]).includes(t)))
    if (orgSchemas.length === 0) return null // 无 Organization schema 由 E01 负责
    const inSchema = new Set(orgSchemas.flatMap((s) => s.sameAs).map(socialPlatformOf).filter((p): p is SocialPlatform => !!p))
    const fetched = got.graph.nodes.filter((n) => n.html).length
    const linked = new Set(detectSocialProfiles(got.graph.external, { fetchedPages: fetched }).map((p) => p.platform))
    const inSchemaNotLinked = [...inSchema].filter((p) => !linked.has(p)).sort()
    const linkedNotInSchema = [...linked].filter((p) => !inSchema.has(p)).sort()
    if (inSchemaNotLinked.length === 0 && linkedNotInSchema.length === 0) return null
    return {
      title: '站内社媒链接与 Organization schema 的 sameAs 不一致',
      description: `${inSchemaNotLinked.length ? `sameAs 声明了 ${inSchemaNotLinked.join('、')}，但已抓取页面中没有链接到它` : ''}${inSchemaNotLinked.length && linkedNotInSchema.length ? '；' : ''}${linkedNotInSchema.length ? `站内链接了 ${linkedNotInSchema.join('、')} 主页，但 sameAs 没有声明` : ''}。两处保持一致有助于搜索与 AI 引擎把品牌实体与官方账号对应起来。`,
      evidenceRefs: [got.auditId, ...orgSchemas.map((s) => s.id)],
      scope: 'geo:entity-social',
      detail: { inSchemaNotLinked, linkedNotInSchema },
    }
  },
}

export const eeatRules: Rule[] = [AR01, AR02, AR03, AR04, AR05, TR06, SO01, SO02]
