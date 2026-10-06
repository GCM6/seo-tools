import { describe, it, expect } from 'vitest'
import type { RuleContext, RuleHitDraft } from '../types'
import type { SiteAuditPage, SiteAuditPayload } from '@/lib/crawl/site-audit'
import type { ArticleSignals } from '@/lib/crawl/article-signals'
import type { ExternalLinkDetail, LightCheckExtra } from '@/lib/crawl/light-check'
import { buildLinkGraph, type LinkGraphPageInput } from '@/lib/crawl/link-graph'
import { eeatRules } from './eeat'

const H = 'https://blog.example'
const rule = (id: string) => eeatRules.find((r) => r.id === id)!

const art = (over: Partial<ArticleSignals> = {}): ArticleSignals => ({
  isArticle: true, articleReasons: ['schema'], author: '作者', authorSource: 'schema', authorUrl: `${H}/authors/a`,
  datePublished: '2024-01-01', dateModified: null, mainWords: 800, stats: { total: 3, attributed: 2 },
  citations: { total: 2, authoritative: 1 }, quotes: 0, tables: 0, hasReferencesSection: false, ...over,
})

type Spec = { links?: (string | { to: string; anchor: string })[]; article?: ArticleSignals; external?: ExternalLinkDetail[]; status?: number; qr?: boolean; contact?: LightCheckExtra['contactLinks'] }

function ctxFor(pages: Record<string, Spec>, opts: { sameAs?: string[]; orgSchema?: boolean } = {}): RuleContext {
  return ctxForHost(pages, H, opts)
}

function ctxForHost(pages: Record<string, Spec>, H: string, opts: { sameAs?: string[]; orgSchema?: boolean } = {}): RuleContext {
  const graphPages: LinkGraphPageInput[] = []
  const auditPages: SiteAuditPage[] = []
  for (const [path, s] of Object.entries(pages)) {
    const url = `${H}${path}`
    graphPages.push({
      url, checkStatus: 'checked', httpStatus: s.status ?? 200, metaRobots: null, discoveredVia: path === '/' ? 'entry' : 'crawl', contentKind: 'html',
      linkDetails: (s.links ?? []).map((l) => (typeof l === 'string' ? { url: `${H}${l}`, count: 1, anchors: [l], regions: ['nav' as const], nofollow: false } : { url: `${H}${l.to}`, count: 1, anchors: [l.anchor], regions: ['nav' as const], nofollow: false })),
      externalLinks: s.external ?? [],
    })
    auditPages.push({
      url, discoveredVia: 'crawl', depth: null, httpStatus: s.status ?? 200, finalUrl: null, canonicalUrl: null, metaRobots: null, mainTextChars: 500,
      inboundLinkCount: 0, checkStatus: 'checked', errorReason: null, isKeyPage: false,
      lightCheckExtra: { hasViewport: true, hreflangEntries: [], imgCount: 0, imgAltMissing: 0, listCount: 0, tableCount: 0, avgParagraphLen: 0, h2QuestionRate: 0, isHttps: true, mixedContentCount: 0, redirected: false, contentKind: 'html', ...(s.article ? { article: s.article } : {}), ...(s.qr ? { socialQrHint: true } : {}), ...(s.contact ? { contactLinks: s.contact } : {}) },
    })
  }
  const payload = {
    protocol: { maxPages: 200, maxDepth: 3 },
    stats: { totalDiscovered: 0, checked: 0, truncated: 0, http4xx: 0, http5xx: 0, errors: 0, blockedByRobots: 0, noindex: 0, canonicalOffsite: 0, orphanPages: 0, citedPages: 0 },
    pages: auditPages, templates: [], citations: [],
    linkGraph: buildLinkGraph({ entryUrl: `${H}/`, pages: graphPages }),
  } as SiteAuditPayload
  const schemas = opts.orgSchema === false ? [] : [{ id: 'sc1', source: `${H}/`, sitePageId: null, types: ['Organization'], sameAs: opts.sameAs ?? [], raw: [], blocks: [] }]
  return { siteAudit: { id: 'sa1', payload }, schemas } as unknown as RuleContext
}

const posts = ['/blog/a', '/blog/b', '/blog/c', '/blog/d']
const trust = ['/about', '/contact', '/privacy', '/terms']
function blog(articles: Partial<ArticleSignals>[]): Record<string, Spec> {
  const pages: Record<string, Spec> = { '/': { links: [...posts.slice(0, articles.length), ...trust] } }
  articles.forEach((a, i) => { pages[posts[i]] = { links: ['/'], article: art(a) } })
  for (const t of trust) pages[t] = { links: ['/'] }
  return pages
}

describe('AR 规则守卫（Review Focus 5）', () => {
  it('文章页 < 3 → AR 整组不判定', () => {
    const ctx = ctxFor(blog([{ author: null }, { author: null }]))
    for (const id of ['AR01', 'AR02', 'AR03', 'AR04', 'AR05']) expect(rule(id).evaluate(ctx)).toBeNull()
  })
})

describe('AR01–AR05（spec S4 §5）', () => {
  it('AR01 缺作者占比 ≥ 50% → 命中，measured_hard，描述声明代理指标', () => {
    const hit = rule('AR01').evaluate(ctxFor(blog([{ author: null, authorSource: null, authorUrl: null }, { author: null, authorSource: null, authorUrl: null }, {}, {}]))) as RuleHitDraft
    expect(hit.detail).toMatchObject({ articleCount: 4, missingCount: 2 })
    // 「文章」集合本身是启发式识别（第三轮独立审查 P0-2）→ inferred
    expect(rule('AR01').claimType).toBe('inferred')
    expect(hit.description).toContain('代理指标')
  })
  it('AR01 缺作者占比 < 50% → 不命中', () => {
    expect(rule('AR01').evaluate(ctxFor(blog([{ author: null }, {}, {}, {}])))).toBeNull()
  })
  it('AR02 有作者但无作者页占比 ≥ 70%', () => {
    expect(rule('AR02').evaluate(ctxFor(blog([{ authorUrl: null }, { authorUrl: null }, { authorUrl: null }, {}])))).not.toBeNull()
    expect(rule('AR02').evaluate(ctxFor(blog([{ authorUrl: null }, {}, {}, {}])))).toBeNull()
  })
  it('AR03 缺日期占比 ≥ 50%', () => {
    expect(rule('AR03').evaluate(ctxFor(blog([{ datePublished: null }, { datePublished: null }, {}, {}])))).not.toBeNull()
  })
  it('AR04 无带归属数据且无引用的文章占比 ≥ 50% → warning，inferred，「未检测到」措辞', () => {
    const bare = { stats: { total: 4, attributed: 0 }, citations: { total: 0, authoritative: 0 } }
    const hit = rule('AR04').evaluate(ctxFor(blog([bare, bare, {}, {}]))) as RuleHitDraft
    expect(rule('AR04').claimType).toBe('inferred')
    expect(rule('AR04').severity).toBe('warning')
    expect(hit.detail).toMatchObject({ articleCount: 4, unsupportedCount: 2, isolatedStats: 8 })
    expect(hit.description).toContain('未检测到')
  })
  it('AR05 有引用的文章中权威来源为 0 的占比 ≥ 70%', () => {
    const weak = { citations: { total: 3, authoritative: 0 } }
    expect(rule('AR05').evaluate(ctxFor(blog([weak, weak, weak, {}])))).not.toBeNull()
    expect(rule('AR05').evaluate(ctxFor(blog([weak, {}, {}, {}])))).toBeNull()
  })
})

describe('TR06 信任页', () => {
  it('四类信任页齐全且首页可达 → 不命中', () => {
    expect(rule('TR06').evaluate(ctxFor(blog([{}, {}, {}])))).toBeNull()
  })
  it('缺联系页 → 命中；抓取完整时 measured_hard', () => {
    const p = blog([{}, {}, {}])
    p['/'] = { links: ['/blog/a', '/blog/b', '/blog/c', '/about', '/privacy', '/terms'] }
    delete p['/contact']
    const hit = rule('TR06').evaluate(ctxFor(p)) as RuleHitDraft
    expect(hit.detail).toMatchObject({ missing: ['contact'], unreachable: [] })
    // 路径/锚文本识别是启发式 → 一律 inferred（第三轮独立审查 P1-5）
    expect(rule('TR06').claimType).toBe('inferred')
  })
})

describe('SO01 / SO02 社媒主页链接', () => {
  const footer = (url: string): ExternalLinkDetail => ({ url, host: new URL(url).hostname.replace(/^www\./, ''), anchor: '', region: 'footer', rel: [] })
  it('已抓页中没有任何社媒主页链接 → SO01 命中', () => {
    expect(rule('SO01').evaluate(ctxFor(blog([{}, {}, {}])))).not.toBeNull()
  })
  it('页脚有 LinkedIn 主页 → SO01 不命中', () => {
    const p = blog([{}, {}, {}])
    p['/'] = { ...p['/'], external: [footer('https://linkedin.com/company/acme')] }
    expect(rule('SO01').evaluate(ctxFor(p))).toBeNull()
  })
  it('SO02：sameAs 有 YouTube 但站内没链接、站内有 LinkedIn 但 sameAs 没有 → 命中', () => {
    const p = blog([{}, {}, {}])
    p['/'] = { ...p['/'], external: [footer('https://linkedin.com/company/acme')] }
    const hit = rule('SO02').evaluate(ctxFor(p, { sameAs: ['https://www.youtube.com/@acme'] })) as RuleHitDraft
    expect(hit.detail).toMatchObject({ inSchemaNotLinked: ['youtube'], linkedNotInSchema: ['linkedin'] })
  })
  it('SO02：没有 Organization schema → 不判定（由 E01 负责）', () => {
    expect(rule('SO02').evaluate(ctxFor(blog([{}, {}, {}]), { orgSchema: false }))).toBeNull()
  })
})

describe('TR06 认同一可注册域名主站上的信任页（Cloudflare 博客形态）', () => {
  it('博客子域页脚链接到主站 www 的关于/联系/条款/隐私页 → 不算缺失', () => {
    const p = blog([{}, {}, {}])
    p['/'] = { links: ['/blog/a', '/blog/b', '/blog/c'], external: ['about', 'contact', 'privacy', 'terms'].map((t) => ({ url: `https://www.example-corp.example/${t}`, host: 'example-corp.example', anchor: t, region: 'footer' as const, rel: [] })) }
    for (const t of trust) delete p[t]
    // 站点自身是 blog.example-corp.example
    const ctx = ctxForHost(p, 'https://blog.example-corp.example')
    expect(rule('TR06').evaluate(ctx)).toBeNull()
  })
})

describe('TR06 信任页路径按词元识别（Cloudflare /website-terms/ 形态）', () => {
  it('/website-terms、/legal/privacy-notice、/about-acme、/contact-sales 都能识别', () => {
    const p = blog([{}, {}, {}])
    for (const t of trust) delete p[t]
    const paths = ['/website-terms', '/legal/privacy-notice', '/about-acme', '/contact-sales']
    p['/'] = { links: ['/blog/a', '/blog/b', '/blog/c', ...paths] }
    for (const x of paths) p[x] = { links: ['/'] }
    expect(rule('TR06').evaluate(ctxFor(p))).toBeNull()
  })
})

describe('修复波 3：TR06 / SO 规则（第三轮独立审查 P1-4/P1-5）', () => {
  const site = (paths: (string | { to: string; anchor: string })[], extra: Record<string, Spec> = {}) => {
    const p: Record<string, Spec> = { '/': { links: ['/blog/a', '/blog/b', '/blog/c', ...paths] } }
    for (const x of paths) p[typeof x === 'string' ? x : x.to] = { links: ['/'] }
    for (const b of ['/blog/a', '/blog/b', '/blog/c']) p[b] = { links: ['/'], article: art() }
    return { ...p, ...extra }
  }
  it('锚文本识别：/introduction「关于三一」、/yinsizhengce「隐私政策」、/flsm「法律声明」、/lxwm「联系我们」', () => {
    const p = site([{ to: '/introduction', anchor: '关于三一' }, { to: '/yinsizhengce', anchor: '隐私政策' }, { to: '/flsm', anchor: '法律声明' }, { to: '/lxwm', anchor: '联系我们' }])
    expect(rule('TR06').evaluate(ctxFor(p))).toBeNull()
  })
  it.each([
    [['/privacypolicy.html', '/termsofservice', '/company', '/contact']],
    [['/impressum', '/datenschutz', '/agb', '/kontakt']],
    [['/guanyuwomen/', '/lianxiwomen/', '/yinsizhengce', '/legal']],
    [['/a-propos', '/contacto', '/politique-de-confidentialite', '/mentions-legales']],
    [['/acerca-de', '/contato', '/privacidad', '/aviso-legal']],
  ])('多语言/拼音/连写路径：%j', (paths) => {
    expect(rule('TR06').evaluate(ctxFor(site(paths)))).toBeNull()
  })
  it('信任页返回 404/500 不算存在，记入 broken', () => {
    const p = site(['/about', '/contact', '/privacy', '/terms'], { '/privacy': { links: ['/'], status: 404 }, '/contact': { links: ['/'], status: 500 } })
    expect((rule('TR06').evaluate(ctxFor(p)) as RuleHitDraft).detail).toMatchObject({ missing: [], broken: ['contact', 'privacy'] })
  })
  const ext = (url: string, region: ExternalLinkDetail['region']): ExternalLinkDetail => ({ url, host: new URL(url).hostname.replace(/^www\./, ''), anchor: '', region, rel: [] })
  it('SO01：正文里的第三方 GitHub 不算官方社媒 → 命中；页脚有公众号二维码图片 → 不命中；规则为 inferred', () => {
    const p = blog([{}, {}, {}])
    p['/blog/a'] = { ...p['/blog/a'], external: [ext('https://github.com/someone', 'main')] }
    expect(rule('SO01').evaluate(ctxFor(p))).not.toBeNull()
    expect(rule('SO01').claimType).toBe('inferred')
    p['/'] = { ...p['/'], qr: true }
    expect(rule('SO01').evaluate(ctxFor(p))).toBeNull()
  })
  it('SO02：正文引用的第三方 YouTube 视频与 GitHub 仓库不算站内社媒主页', () => {
    const p = blog([{}, {}, {}])
    p['/'] = { ...p['/'], external: [ext('https://linkedin.com/company/acme', 'footer')] }
    p['/blog/a'] = { ...p['/blog/a'], external: [ext('https://www.youtube.com/watch?v=x', 'main'), ext('https://github.com/acme/repo', 'main'), ext('https://www.youtube.com/@other', 'main')] }
    expect(rule('SO02').evaluate(ctxFor(p, { sameAs: ['https://www.linkedin.com/company/acme'] }))).toBeNull()
  })
})


describe('TR06 联系方式：页眉/页脚/导航里的邮箱或电话链接即算提供了联系方式（metadocu.com 误报）', () => {
  const noContactPage = () => {
    const p = blog([{}, {}, {}])
    p['/'] = { links: ['/blog/a', '/blog/b', '/blog/c', '/about', '/privacy', '/terms'] }
    delete p['/contact']
    return p
  }
  it('任一页页脚有 mailto → 不报缺联系方式', () => {
    const p = noContactPage()
    p['/about'] = { ...p['/about'], contact: [{ kind: 'email', region: 'footer' }] }
    expect(rule('TR06').evaluate(ctxFor(p))).toBeNull()
  })
  it('入口页正文里的电话链接也算；非入口页正文里的邮箱不算', () => {
    const entry = noContactPage()
    entry['/'] = { ...entry['/'], contact: [{ kind: 'phone', region: 'main' }] }
    expect(rule('TR06').evaluate(ctxFor(entry))).toBeNull()
    const inner = noContactPage()
    inner['/blog/a'] = { ...inner['/blog/a'], contact: [{ kind: 'email', region: 'main' }] }
    expect((rule('TR06').evaluate(ctxFor(inner)) as RuleHitDraft).detail).toMatchObject({ missing: ['contact'] })
  })
})
