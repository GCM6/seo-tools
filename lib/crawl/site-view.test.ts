import { describe, it, expect } from 'vitest'
import { filterToSnapshot, depthCellsFor, linkStructureCounts, snapshotStatusFor } from './site-view'
import { buildLinkGraph, type LinkGraphPageInput } from './link-graph'
import type { SiteAuditPage, SiteAuditPayload } from './site-audit'

const H = 'https://ex.com'
const gp = (path: string, links: string[] | null, over: Partial<LinkGraphPageInput> = {}): LinkGraphPageInput => ({
  url: `${H}${path}`, checkStatus: 'checked', httpStatus: 200, metaRobots: null, discoveredVia: 'crawl',
  linkDetails: links && links.map((l) => ({ url: `${H}${l}`, count: 1, anchors: [], regions: ['main' as const], nofollow: false })),
  externalLinks: [], ...over,
})
const ap = (path: string, over: Partial<SiteAuditPage> = {}): SiteAuditPage => ({
  url: `${H}${path}`, discoveredVia: 'crawl', depth: null, httpStatus: 200, finalUrl: null, canonicalUrl: null,
  metaRobots: null, mainTextChars: 100, inboundLinkCount: 0, checkStatus: 'checked', errorReason: null, isKeyPage: false, ...over,
})
const payload = (graphPages: LinkGraphPageInput[], pages: SiteAuditPage[]): SiteAuditPayload => ({
  protocol: { maxPages: 200, maxDepth: 3 },
  stats: { totalDiscovered: 0, checked: 0, truncated: 0, http4xx: 0, http5xx: 0, errors: 0, blockedByRobots: 0, noindex: 0, canonicalOffsite: 0, orphanPages: 0, citedPages: 0 },
  pages, templates: [], citations: [],
  linkGraph: buildLinkGraph({ entryUrl: `${H}/`, pages: graphPages }),
})

describe('filterToSnapshot（spec S2 §5）', () => {
  it('有快照只保留快照中的 URL；无快照原样返回', () => {
    const rows = [{ url: `${H}/a`, id: 1 }, { url: `${H}/old`, id: 2 }]
    expect(filterToSnapshot(rows, payload([], [ap('/a')])).map((r) => r.id)).toEqual([1])
    expect(filterToSnapshot(rows, null)).toBe(rows)
  })
})

describe('depthCellsFor', () => {
  it('精确深度 / 上界 / 闭包不完整时未发现路径 / 无图谱', () => {
    const p = payload(
      [gp('/', ['/a', '/err'], { discoveredVia: 'entry' }), gp('/a', ['/b']), gp('/err', null, { checkStatus: 'error', httpStatus: 0 }), gp('/b', []), gp('/iso', [])],
      [],
    )
    const cell = depthCellsFor(p)
    expect(cell(`${H}/a`)).toEqual({ kind: 'exact', depth: 1, inAll: 1 })
    expect(cell(`${H}/b`)).toEqual({ kind: 'upper', depth: 2, inAll: 1 })
    expect(cell(`${H}/iso`)).toEqual({ kind: 'no_path_found', depth: null, inAll: 0 })
    expect(cell(`${H}/missing`).kind).toBe('unknown')
    expect(depthCellsFor(null)(`${H}/a`).kind).toBe('unknown')
  })

  it('闭包完整时深度为空 → 不可达', () => {
    const cell = depthCellsFor(payload([gp('/', ['/a'], { discoveredVia: 'entry' }), gp('/a', []), gp('/iso', [])], []))
    expect(cell(`${H}/iso`)).toEqual({ kind: 'unreachable', depth: null, inAll: 0 })
  })
})

describe('linkStructureCounts', () => {
  it('与分析层同源的计数；入口零出链时只给提示标志', () => {
    const p = payload(
      [gp('/', ['/a', '/gone'], { discoveredVia: 'entry' }), gp('/a', ['/']), gp('/gone', [], { httpStatus: 404 }), gp('/x', ['/y'], { discoveredVia: 'sitemap' }), gp('/y', ['/x'], { discoveredVia: 'sitemap' })],
      [ap('/'), ap('/a'), ap('/gone', { httpStatus: 404 }), ap('/x'), ap('/y')],
    )
    expect(linkStructureCounts(p)).toEqual({ entryNoLinks: false, reachable: 3, unreachableSitemap: 2, brokenTargets: 1, deadEnds: 0, exhaustive: true, closureComplete: true })
    const noLinks = payload([gp('/', [], { discoveredVia: 'entry' })], [ap('/')])
    expect(linkStructureCounts(noLinks)).toMatchObject({ entryNoLinks: true })
    expect(linkStructureCounts(null)).toBeNull()
  })
})

describe('修复波 2（第二轮独立审查 #8/#17）', () => {
  it('入口零站内出链（分析被跳过）→ 深度列一律 unknown，不显示确定性的「不可达」', () => {
    const cell = depthCellsFor(payload([gp('/', [], { discoveredVia: 'entry' }), gp('/a', []), gp('/b', [])], []))
    expect([cell(`${H}/a`).kind, cell(`${H}/b`).kind]).toEqual(['unknown', 'unknown'])
  })

  it('HTTP 状态与抓取状态取自本次快照（历史 run 不显示最新一轮的值）', () => {
    const status = snapshotStatusFor(payload([], [ap('/a', { httpStatus: 404, checkStatus: 'checked' })]))
    expect(status(`${H}/a`)).toEqual({ httpStatus: 404, checkStatus: 'checked' })
    expect(status(`${H}/missing`)).toBeNull()
    expect(snapshotStatusFor(null)(`${H}/a`)).toBeNull()
  })
})

