import { describe, it, expect } from 'vitest'
import { analyzeLinkIntegrity, reachableViaAnyLink, type LinkIntegrityInput } from './link-integrity'
import { buildLinkGraph, readLinkGraph, type LinkGraphPageInput } from './link-graph'
import type { SiteAuditPage } from './site-audit'
import type { InternalLinkDetail } from './light-check'

const H = 'https://ex.com'
type Spec = {
  links?: (string | { to: string; nofollow?: boolean; regions?: InternalLinkDetail['regions']; anchor?: string })[]
  status?: number
  checkStatus?: string
  via?: string
  metaRobots?: string | null
  canonical?: string | null
  finalUrl?: string | null
  mainTextChars?: number
  errorReason?: string
}

// 以路径描述站点 → 真实 buildLinkGraph + SiteAuditPage 列表。
function site(pages: Record<string, Spec>, extra: Partial<LinkIntegrityInput> = {}): LinkIntegrityInput {
  const graphPages: LinkGraphPageInput[] = []
  const auditPages: SiteAuditPage[] = []
  for (const [path, s] of Object.entries(pages)) {
    const url = `${H}${path}`
    const checkStatus = s.checkStatus ?? 'checked'
    const linkDetails = checkStatus === 'checked'
      ? (s.links ?? []).map((l) => {
          const o = typeof l === 'string' ? { to: l } : l
          return { url: `${H}${o.to}`, count: 1, anchors: [o.anchor ?? o.to], regions: o.regions ?? ['main'], nofollow: o.nofollow ?? false }
        })
      : null
    graphPages.push({ url, finalUrl: s.finalUrl ?? null, checkStatus, httpStatus: s.status ?? 200, metaRobots: s.metaRobots ?? null, discoveredVia: s.via ?? 'crawl', linkDetails, externalLinks: [] })
    auditPages.push({
      url, discoveredVia: s.via ?? 'crawl', depth: null, httpStatus: s.status ?? 200, finalUrl: s.finalUrl ?? null,
      canonicalUrl: s.canonical ?? null, metaRobots: s.metaRobots ?? null, mainTextChars: s.mainTextChars ?? 100,
      inboundLinkCount: 0, checkStatus, errorReason: s.errorReason ?? null, isKeyPage: false,
    })
  }
  return { pages: auditPages, linkGraph: buildLinkGraph({ entryUrl: `${H}/`, pages: graphPages }), ...extra }
}
const urls = (list: { url: string }[]) => list.map((r) => r.url.replace(H, ''))
const paths = (list: string[]) => list.map((u) => u.replace(H, ''))

describe('analyzeLinkIntegrity（spec S2 §3）', () => {
  it('无图谱 / 入口零站内出链 → null', () => {
    expect(analyzeLinkIntegrity({ pages: [], linkGraph: undefined })).toBeNull()
    expect(analyzeLinkIntegrity(site({ '/': { via: 'entry' }, '/a': {} }))).toBeNull()
  })

  it('断链：已抓 4xx 且有入链；未抓目标只计 unverified', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/gone', '/gone2', '/a'] },
      '/a': { links: ['/gone', '/never-fetched'] },
      '/gone': { status: 404 },
      '/gone2': { status: 500 },
    }))!
    // 只有 404/410 算实测断链；5xx/403/429 可能是临时故障或反爬，只计 errorTargets（审查 P1 同源）。
    expect(urls(r.broken)).toEqual(['/gone'])
    expect(r.broken[0].edges.map((e) => e.from.replace(H, '')).sort()).toEqual(['/', '/a'])
    expect(r.errorTargets).toBe(1)
    expect(r.unverifiedTargets).toBe(1)
  })

  it('跳转：目标 finalUrl≠url 且 <400；入口 URL 跳转不计（Review Focus 1）', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', finalUrl: `${H}/en`, links: ['/moved', '/a'] },
      '/a': { links: ['/'] },
      '/moved': { finalUrl: `${H}/a` },
    }))!
    expect(urls(r.redirects)).toEqual(['/moved'])
    expect(r.redirects[0].finalUrl).toBe(`${H}/a`)
  })

  it('noindex / canonical 指向本站他页；只计可跟随边', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/ni', '/dup', { to: '/ni2', nofollow: true }, '/self'] },
      '/ni': { metaRobots: 'noindex, follow' },
      '/ni2': { metaRobots: 'noindex' },
      '/dup': { canonical: '/orig' },
      '/self': { canonical: `${H}/self/` },
    }))!
    expect(r.nonIndexable.map((t) => [t.url.replace(H, ''), t.reason])).toEqual([['/dup', 'canonical'], ['/ni', 'noindex']])
  })

  it('noindex 的法律/账户/购物车/站内搜索等功能页不计入 L03（真实站点冒烟发现的噪音）', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/privacy-policy', '/terms', '/account/login', '/cart', '/search', '/guide'] },
      '/privacy-policy': { metaRobots: 'noindex' },
      '/terms': { metaRobots: 'noindex' },
      '/account/login': { metaRobots: 'noindex' },
      '/cart': { metaRobots: 'noindex' },
      '/search': { metaRobots: 'noindex' },
      '/guide': { metaRobots: 'noindex' },
    }))!
    expect(urls(r.nonIndexable)).toEqual(['/guide'])
  })

  it('孤岛：sitemap+200+非 noindex+任何边不可达+inAll>0；inAll=0 归 T05；noindex 排除（Review Focus 5）', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/a'] },
      '/a': {},
      '/x': { via: 'sitemap', links: ['/y'] },
      '/y': { via: 'sitemap', links: ['/x', '/hid'] },
      '/hid': { via: 'sitemap', metaRobots: 'noindex' },
      '/zero': { via: 'sitemap' },
    }))!
    expect(paths(r.islands)).toEqual(['/x', '/y'])
    expect(r.islandsExact).toBe(true)
  })

  it('孤岛非精确：任意边 BFS 到达了未解析节点', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/a', '/err'] },
      '/a': {},
      '/err': { checkStatus: 'error', status: 0 },
      '/x': { via: 'sitemap', links: ['/y'] },
      '/y': { via: 'sitemap', links: ['/x'] },
    }))!
    expect(paths(r.islands)).toEqual(['/x', '/y'])
    expect(r.islandsExact).toBe(false)
  })

  it('仅经 nofollow 可达', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/a', { to: '/nf', nofollow: true }] },
      '/a': {},
      '/nf': {},
    }))!
    expect(paths(r.nofollowOnly)).toEqual(['/nf'])
    expect(r.nofollowOnlyExact).toBe(true)
    expect(paths(r.islands)).toEqual([])
  })

  it('死胡同：200、有正文、零站内出链；入口不计', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/a', '/b', '/c'] },
      '/a': { links: ['/'] },
      '/b': { links: ['/'] },
      '/c': {},
      '/empty': { mainTextChars: 0 },
    }))!
    expect(paths(r.deadEnds)).toEqual(['/c'])
    expect(r.deadEndSuspect).toBe(false)
  })

  it('≥50% 已抓 200 页是死胡同 → 判抽取失败，不报（Review Focus 2）', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/a', '/b'] },
      '/a': {},
      '/b': {},
    }))!
    expect(r.deadEndSuspect).toBe(true)
    expect(r.deadEnds).toEqual([])
  })

  it('站外失效：仅 404/410 入清单，来源取自图谱站外链接', () => {
    const input = site({ '/': { via: 'entry', links: ['/a'] }, '/a': {} })
    const g = readLinkGraph({ linkGraph: input.linkGraph })!
    expect(g.external).toEqual([])
    const withExternal: LinkIntegrityInput = {
      ...input,
      linkGraph: buildLinkGraph({
        entryUrl: `${H}/`,
        pages: [
          { url: `${H}/`, checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'entry', linkDetails: [{ url: `${H}/a`, count: 1, anchors: [], regions: ['main'], nofollow: false }], externalLinks: [{ url: 'https://gone.com/p', host: 'gone.com', anchor: '参考', region: 'main', rel: [] }] },
          { url: `${H}/a`, checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'crawl', linkDetails: [{ url: `${H}/`, count: 1, anchors: [], regions: ['nav'], nofollow: false }], externalLinks: [] },
        ],
      }),
      externalChecks: [
        { url: 'https://gone.com/p', status: 404, error: null },
        { url: 'https://flaky.com/p', status: 503, error: null },
        { url: 'https://slow.com/p', status: null, error: 'timeout' },
      ],
    }
    const r = analyzeLinkIntegrity(withExternal)!
    expect(r.externalBroken.map((b) => [b.url, b.status, b.sources.map((s) => s.from.replace(H, ''))])).toEqual([['https://gone.com/p', 404, ['/']]])
    expect(r.externalUnverified).toBe(2)
  })
})

describe('reachableViaAnyLink', () => {
  it('沿 nofollow 与 meta nofollow 源页的边也能到达', () => {
    const input = site({
      '/': { via: 'entry', links: [{ to: '/a', nofollow: true }] },
      '/a': { metaRobots: 'nofollow', links: ['/b'] },
      '/b': {},
    })
    const r = reachableViaAnyLink(readLinkGraph({ linkGraph: input.linkGraph })!)
    expect(paths([...r.urls]).sort()).toEqual(['/', '/a', '/b'])
    expect(r.complete).toBe(true)
  })
})

describe('修复波 2（第二轮独立审查 #3/#4/#12）', () => {
  it('跳转到 404/503 的链接不进 L02（改成最终地址也是坏的）；404 目标进 L01 且边带跳转前地址', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/old', '/moved', '/ok-move', '/a'] },
      '/a': { links: ['/'] },
      '/old': { finalUrl: `${H}/gone` },
      '/gone': { status: 404 },
      '/moved': { finalUrl: `${H}/maint` },
      '/maint': { status: 503 },
      '/ok-move': { finalUrl: `${H}/a` },
    }))!
    expect(urls(r.redirects)).toEqual(['/ok-move'])
    expect(urls(r.broken)).toEqual(['/gone'])
    expect(r.broken[0].edges[0].redirectedFrom).toBe(`${H}/old`)
  })

  it('站外失效结果没有本站来源 → 不进清单（第三方页面上的链接不算本站）', () => {
    const input = site({ '/': { via: 'entry', links: ['/a'] }, '/a': {} })
    const r = analyzeLinkIntegrity({ ...input, externalChecks: [{ url: 'https://third.com/dead', status: 404, error: null }] })!
    expect(r.externalBroken).toEqual([])
  })

  it('功能页排除只认精确段名：/legal-services、/privacy-screen-protectors 等正常内容页照常报', () => {
    const paths = ['/privacy-policy', '/terms-of-service', '/login', '/account', '/cart', '/search', '/legal-services', '/privacy-screen-protectors', '/account-based-marketing', '/cart-accessories', '/search-engine-optimization-guide', '/register-your-product']
    const pages: Record<string, Parameters<typeof site>[0][string]> = { '/': { via: 'entry', links: paths } }
    for (const p of paths) pages[p] = { metaRobots: 'noindex' }
    const r = analyzeLinkIntegrity(site(pages))!
    expect(urls(r.nonIndexable).sort()).toEqual(['/account-based-marketing', '/cart-accessories', '/legal-services', '/privacy-screen-protectors', '/register-your-product', '/search-engine-optimization-guide'])
  })
})


describe('真实站点冒烟修复（2026-10-03，jac.com.cn / ruanyifeng.com）', () => {
  it('跳转目标抓取失败（status 0）不进 L02：改成「最终地址」同样打不开', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/old', '/a'] },
      '/a': { links: [] },
      '/old': { finalUrl: `${H}/new` },
      '/new': { checkStatus: 'error', status: 0, errorReason: 'fetch failed' },
    }))!
    expect(r.redirects).toEqual([])
  })

  it('重定向循环是确定性故障 → 进断链清单（reason=redirect_loop）；超时等其他抓取失败只计 errorTargets', () => {
    const r = analyzeLinkIntegrity(site({
      '/': { via: 'entry', links: ['/loop', '/slow', '/a'] },
      '/a': { links: ['/loop'] },
      '/loop': { checkStatus: 'error', status: 0, errorReason: 'too many redirects (redirect loop) fetching https://ex.com/loop' },
      '/slow': { checkStatus: 'error', status: 0, errorReason: 'This operation was aborted' },
    }))!
    expect(r.broken.map((b) => [b.url.replace(H, ''), b.httpStatus, b.reason, b.edges.length])).toEqual([['/loop', null, 'redirect_loop', 2]])
    expect(r.errorTargets).toBe(1)
  })
})
