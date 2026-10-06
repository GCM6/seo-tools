import { describe, it, expect } from 'vitest'
import { buildLinkGraph, readLinkGraph, inboundAllByUrl, type LinkGraphPageInput } from './link-graph'
import type { InternalLinkDetail } from './light-check'

const H = 'https://ex.com'
const L = (path: string, over: Partial<InternalLinkDetail> = {}): InternalLinkDetail =>
  ({ url: `${H}${path}`, count: 1, anchors: [path], regions: ['main'], nofollow: false, ...over })
const P = (path: string, links: InternalLinkDetail[] | null = [], over: Partial<LinkGraphPageInput> = {}): LinkGraphPageInput => ({
  url: `${H}${path}`, checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'crawl',
  linkDetails: links, externalLinks: [], ...over,
})
const view = (pages: LinkGraphPageInput[]) => readLinkGraph({ linkGraph: buildLinkGraph({ entryUrl: `${H}/`, pages }) })!
const node = (v: ReturnType<typeof view>, path: string) => v.nodeByUrl.get(`${H}${path}`)!

describe('buildLinkGraph（spec S1 §6）', () => {
  it('BFS 最短点击深度；nofollow 边不传递深度', () => {
    const v = view([
      P('/', [L('/a'), L('/c', { nofollow: true })], { discoveredVia: 'entry' }),
      P('/a', [L('/b')]),
      P('/b', [L('/c', { nofollow: true })]),
      P('/c'),
    ])
    expect([node(v, '/').depth, node(v, '/a').depth, node(v, '/b').depth, node(v, '/c').depth]).toEqual([0, 1, 2, null])
    expect(v.closureComplete).toBe(true)
    expect(v.exhaustive).toBe(true)
    expect(v.exactDepthHorizon).toBeNull()
  })

  it('最短路径优先：同一节点经多条路径到达取最小深度', () => {
    const v = view([P('/', [L('/a'), L('/c')], { discoveredVia: 'entry' }), P('/a', [L('/b')]), P('/b', [L('/c')]), P('/c')])
    expect(node(v, '/c').depth).toBe(1)
  })

  it('meta robots nofollow 页的出链不可跟随', () => {
    const v = view([P('/', [L('/a')], { discoveredVia: 'entry' }), P('/a', [L('/b')], { metaRobots: 'noindex, nofollow' }), P('/b')])
    expect(node(v, '/b').depth).toBeNull()
    expect(node(v, '/a').metaNofollow).toBe(true)
    expect(v.edges.find((e) => e.from === `${H}/a`)?.followable).toBe(false)
  })

  it('视界 H = 已到达未解析节点的最小深度；更深节点只是上界', () => {
    const v = view([
      P('/', [L('/err'), L('/b')], { discoveredVia: 'entry' }),
      P('/err', null, { checkStatus: 'error', httpStatus: 0 }),
      P('/b', [L('/c')]),
      P('/c', null, { checkStatus: 'discovered_only', httpStatus: null }),
    ])
    expect(v.exactDepthHorizon).toBe(1)
    expect(node(v, '/b').depthExact).toBe(true)
    expect(node(v, '/err')).toMatchObject({ depth: 1, depthExact: true, error: true, resolved: false })
    expect(node(v, '/c')).toMatchObject({ depth: 2, depthExact: false })
    expect(v.closureComplete).toBe(false)
    expect(v.exhaustive).toBe(false)
  })

  it('robots 禁抓页算已解析；只作为链接目标出现的 URL 是未解析节点', () => {
    const v = view([
      P('/', [L('/blocked'), L('/a')], { discoveredVia: 'entry' }),
      P('/blocked', null, { checkStatus: 'blocked_by_robots', httpStatus: null }),
      P('/a', [L('/beyond')]),
    ])
    expect(node(v, '/blocked')).toMatchObject({ resolved: true, blocked: true, depth: 1 })
    expect(node(v, '/beyond')).toMatchObject({ resolved: false, fetched: false, depth: 2, depthExact: true, httpStatus: null })
    expect(v.exactDepthHorizon).toBe(2)
  })

  it('入度：inAll 计所有源页，inFollow 只计可跟随；自链忽略', () => {
    const v = view([
      P('/', [L('/t'), L('/a')], { discoveredVia: 'entry' }),
      P('/a', [L('/t', { nofollow: true }), L('/a')]),
      P('/t'),
    ])
    expect(node(v, '/t')).toMatchObject({ inAll: 2, inFollow: 1 })
    expect(node(v, '/a').outInternal).toBe(1)
    expect(inboundAllByUrl(buildLinkGraph({ entryUrl: `${H}/`, pages: [P('/', [L('/t')]), P('/t')] }))[`${H}/t`]).toBe(1)
  })

  it('sitemap 节点首页不可达计入 unreachableSitemapNodes；站外链接往返解码', () => {
    const v = view([
      P('/', [], { discoveredVia: 'entry', externalLinks: [{ url: 'https://x.com/p', host: 'x.com', anchor: 'X', region: 'footer', rel: ['nofollow'] }] }),
      P('/x', [L('/y')], { discoveredVia: 'sitemap' }),
      P('/y', [L('/x')], { discoveredVia: 'both' }),
    ])
    expect(v.summary.unreachableSitemapNodes).toBe(2)
    expect(node(v, '/x').inSitemap).toBe(true)
    expect(v.external).toEqual([{ from: `${H}/`, url: 'https://x.com/p', host: 'x.com', anchor: 'X', region: 'footer', rel: ['nofollow'] }])
    expect(node(v, '/').outExternal).toBe(1)
  })

  it('边解码保留锚文本/区域/次数；历史证据无 linkGraph 返回 null', () => {
    const v = view([P('/', [L('/a', { count: 3, anchors: ['A1', 'A2'], regions: ['nav', 'footer'] })], { discoveredVia: 'entry' }), P('/a')])
    expect(v.edges).toEqual([{ from: `${H}/`, to: `${H}/a`, count: 3, regions: ['nav', 'footer'], nofollow: false, followable: true, anchors: ['A1', 'A2'] }])
    expect(readLinkGraph(null)).toBeNull()
    expect(readLinkGraph({})).toBeNull()
  })

  it('入口页不在页面列表（抓取失败未落库）时入口仍为深度 0、其余不可达', () => {
    const v = view([P('/a')])
    expect(v.entryUrl).toBe(`${H}/`)
    expect(node(v, '/')).toMatchObject({ depth: 0, resolved: false })
    expect(node(v, '/a').depth).toBeNull()
    expect(v.exactDepthHorizon).toBe(0)
  })

  it('编码可 JSON 往返（Inngest/libSQL 存储）', () => {
    const g = buildLinkGraph({ entryUrl: `${H}/`, pages: [P('/', [L('/a')]), P('/a')] })
    expect(readLinkGraph({ linkGraph: JSON.parse(JSON.stringify(g)) })!.nodes).toEqual(readLinkGraph({ linkGraph: g })!.nodes)
  })
})

// —— S1 修复波：审查复现 A–I 固化为回归（前提「已解析 ⇒ 出链完整已知」逐类输入）——
describe('完整性前提：只有出链确实已知的页才算已解析（审查 P1/P2/P3/P5）', () => {
  it('A：5xx/429/403 页出链未知 → 视界压低，下游深度不是精确值', () => {
    for (const status of [503, 429, 403]) {
      const v = view([
        P('/', [L('/hub'), L('/b')], { discoveredVia: 'entry' }),
        P('/hub', [], { httpStatus: status }),
        P('/b', [L('/c')]), P('/c', [L('/d')]), P('/d', [L('/target')]), P('/target'),
      ])
      expect(node(v, '/hub')).toMatchObject({ resolved: false, linkState: 'unknown' })
      expect(v.exactDepthHorizon).toBe(1)
      expect(node(v, '/target')).toMatchObject({ depth: 4, depthExact: false })
      expect(v.exhaustive).toBe(false)
    }
  })

  it('404/410 页与图片/PDF 出链确定为空 → 算已解析且出链已知', () => {
    const v = view([
      P('/', [L('/gone'), L('/a.jpg'), L('/b')], { discoveredVia: 'entry' }),
      P('/gone', [], { httpStatus: 404 }),
      P('/a.jpg', [], { contentKind: 'media' }),
      P('/b'),
    ])
    expect(node(v, '/gone')).toMatchObject({ resolved: true, linksKnown: true, linkState: 'none' })
    expect(node(v, '/a.jpg')).toMatchObject({ resolved: true, linksKnown: true, html: false })
    expect(v.exhaustive).toBe(true)
  })

  it('D：非 HTML 的未知类型（contentKind=other）出链未知', () => {
    const v = view([P('/', [L('/api')], { discoveredVia: 'entry' }), P('/api', [], { contentKind: 'other' })])
    expect(node(v, '/api')).toMatchObject({ resolved: false, linkState: 'unknown' })
  })

  it('B：链接被截断的页已知边照常展开，但不算已解析', () => {
    const v = view([
      P('/', [L('/b')], { discoveredVia: 'entry', linksTruncated: true }),
      P('/b', [L('/c')]), P('/c', [L('/d')]), P('/d', [L('/target')]), P('/target'),
    ])
    expect(node(v, '/')).toMatchObject({ linkState: 'partial', resolved: false })
    expect(node(v, '/b').depth).toBe(1)
    expect(v.exactDepthHorizon).toBe(0)
    expect(node(v, '/target').depthExact).toBe(false)
  })

  it('E：入口 503 → 视界 0、闭包不完整、未穷尽', () => {
    const v = view([P('/', [], { discoveredVia: 'entry', httpStatus: 503 }), P('/s', [], { discoveredVia: 'sitemap' })])
    expect([v.exactDepthHorizon, v.closureComplete, v.exhaustive]).toEqual([0, false, false])
  })

  it('G/I：robots 禁抓页对搜索引擎发现口径已解析，但出链未知 → 不算穷尽', () => {
    const v = view([
      P('/', [L('/private'), L('/b')], { discoveredVia: 'entry' }),
      P('/private', null, { checkStatus: 'blocked_by_robots', httpStatus: null }),
      P('/b'),
    ])
    expect(node(v, '/private')).toMatchObject({ resolved: true, linksKnown: false, linkState: 'blocked' })
    expect(v.closureComplete).toBe(true)
    expect(v.exhaustive).toBe(false)
  })

  it('C/H：同站跳转的请求 URL 合并到最终 URL，入链与深度按最终 URL 计，边带跳转来源', () => {
    const v = view([
      P('/', [L('/old-shop'), L('/b')], { discoveredVia: 'entry' }),
      P('/old-shop', [L('/x')], { finalUrl: `${H}/shop` }),
      P('/b', [L('/shop')]),
      P('/x'),
    ])
    expect(v.nodeByUrl.has(`${H}/old-shop`)).toBe(false)
    expect(v.nodeFor(`${H}/old-shop`)?.url).toBe(`${H}/shop`)
    expect(node(v, '/shop')).toMatchObject({ depth: 1, inAll: 2, fetched: true })
    expect(node(v, '/x').depth).toBe(2)
    expect(v.edges.find((e) => e.from === `${H}/` && e.to === `${H}/shop`)?.redirectedFrom).toBe(`${H}/old-shop`)
    expect(v.edges.find((e) => e.from === `${H}/b` && e.to === `${H}/shop`)?.redirectedFrom).toBeUndefined()
    const inbound = inboundAllByUrl(buildLinkGraph({ entryUrl: `${H}/`, pages: [P('/', [L('/old')]), P('/old', [], { finalUrl: `${H}/new` })] }))
    expect([inbound[`${H}/old`], inbound[`${H}/new`]]).toEqual([1, 1])
  })

  it('入口跳转（/ → /en）：入口节点为最终 URL，记录请求入口', () => {
    const v = view([P('/', [L('/a')], { discoveredVia: 'entry', finalUrl: `${H}/en` }), P('/a')])
    expect([v.entryUrl, v.entryRequestedUrl, node(v, '/a').depth]).toEqual([`${H}/en`, `${H}/`, 1])
  })

  it('跨站跳转的页不并入站内节点，出链视为空', () => {
    const v = view([P('/', [L('/out')], { discoveredVia: 'entry' }), P('/out', [L('/secret')], { finalUrl: 'https://other.com/' })])
    expect(node(v, '/out')).toMatchObject({ linkState: 'none', outInternal: 0 })
    expect(v.nodeByUrl.has(`${H}/secret`)).toBe(false)
  })
})

describe('修复波 2（第二轮独立审查 #2/#4/#18）', () => {
  it('PDF/Office（document）出链未知；feed/CSS（resource）不属于 HTML 链接图、出链为空', () => {
    const v = view([
      P('/', [L('/catalog.pdf'), L('/feed')], { discoveredVia: 'entry' }),
      P('/catalog.pdf', [], { contentKind: 'document' }),
      P('/feed', [], { contentKind: 'resource' }),
    ])
    expect(node(v, '/catalog.pdf')).toMatchObject({ linkState: 'unknown', resolved: false })
    expect(node(v, '/feed')).toMatchObject({ linkState: 'none', resolved: true, linksKnown: true, html: false })
    expect(v.exhaustive).toBe(false)
  })

  it('站外链接保留原始 href', () => {
    const v = view([P('/', [L('/a')], { discoveredVia: 'entry', externalLinks: [{ url: 'https://other.com/docs', host: 'other.com', anchor: 'o', region: 'main', rel: [], href: 'https://www.other.com/docs/?ref=abc' }] }), P('/a')])
    expect(v.external[0]).toMatchObject({ url: 'https://other.com/docs', href: 'https://www.other.com/docs/?ref=abc' })
  })

  it('版本不匹配的图谱不解码（返回 null，规则回退旧逻辑）', () => {
    const g = buildLinkGraph({ entryUrl: `${H}/`, pages: [P('/', [L('/a')]), P('/a')] })
    expect(readLinkGraph({ linkGraph: { ...g, version: 1 as never } })).toBeNull()
  })
})

