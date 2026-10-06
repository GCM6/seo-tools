import { describe, it, expect } from 'vitest'
import { pillarsWithData, evidenceUsable } from './pillars-with-data'
import { PSI_FAILED_AS_COLLECTED_PAYLOAD } from '@/lib/test-fixtures/real-shapes'
import replay from '@/lib/test-fixtures/metadocu-run-d12cceaf.json'

// 10-03 metadocu 运行的真实证据（回放夹具，本地库只读导出）。
const METADOCU_EVIDENCE = replay.evidence.map((e) => ({ type: e.type, payload: e.payload as unknown }))

const ev = (type: string, payload: unknown = { any: 1 }) => ({ type, payload })
// collect-stage 写入的种子词 SERP 证据形状（kind 区分 seed_serp / bing_index / brand_serp）。
const seedSerp = (items: unknown[] = [{ domain: 'rival.com', url: 'https://rival.com/', rank: 1, title: 'r', type: 'organic' }]) =>
  ev('dataforseo_serp', { kind: 'seed_serp', engine: 'google', locationCode: 2840, languageCode: 'en', results: [{ keyword: 'remove exif', items }] })

describe('pillarsWithData（SP-A §5.4：只按"可用证据"入分）', () => {
  // P4（竞品对比）影子闸门保持原样：没有已确认竞品时 Q01/Q02/Q03 全部空转。
  it('excludes P4 when dataforseo_serp evidence exists but confirmedCompetitorCount is 0', () => {
    expect(pillarsWithData([seedSerp()], 0)).not.toContain('P4')
  })
  it('includes P4 when dataforseo_serp evidence exists and confirmedCompetitorCount > 0', () => {
    expect(pillarsWithData([seedSerp()], 2)).toContain('P4')
  })
  it('有确认竞品，但只有品牌词 / Bing 收录的 SERP 证据（种子 SERP 失败或没有种子）→ P4 不入分（最终审查 F2-1）', () => {
    const brand = ev('dataforseo_serp', { kind: 'brand_serp', engine: 'google', brandQuery: 'acme', hasKnowledgePanel: false, ownDomainPresent: true, items: [] })
    const bing = ev('dataforseo_serp', { kind: 'bing_index', engine: 'bing', domain: 'acme.com', totalCount: 12, itemCount: 5 })
    expect(pillarsWithData([brand, bing], 2)).not.toContain('P4')
  })
  it('种子 SERP 每个词都没有结果 → P4 不入分（没有可比对的竞品位置）', () => {
    expect(pillarsWithData([seedSerp([])], 2)).not.toContain('P4')
  })

  it('PSI 采集失败却以全 null 落库（历史形态）→ 不让 P1 入分', () => {
    expect(pillarsWithData([ev('psi', PSI_FAILED_AS_COLLECTED_PAYLOAD)], 0)).toEqual([])
  })
  it('PSI 有 CrUX 现场数据或 Lighthouse 分数 → P1 入分', () => {
    const withCrux = { ...PSI_FAILED_AS_COLLECTED_PAYLOAD, crux: { cls: 0.05, hasFieldData: true, inpMs: 180, lcpMs: 2100 } }
    const withLab = { ...PSI_FAILED_AS_COLLECTED_PAYLOAD, lighthouse: { opportunities: [], performanceScore: 87, ttfbMs: 300 } }
    expect(pillarsWithData([ev('psi', withCrux)], 0)).toEqual(['P1'])
    expect(pillarsWithData([ev('psi', withLab)], 0)).toEqual(['P1'])
  })

  it('没有 gsc / dataforseo_labs 证据 → 不含 P3（不再因"有发现"入分）', () => {
    expect(pillarsWithData([ev('schema'), seedSerp()], 0)).toEqual(['P2'])
  })

  it('metadocu 10-03 真实运行复算 → P1、P2、P5（P1 由 site_audit / page_fetch 支撑，不依赖失败的 PSI）', () => {
    expect(pillarsWithData(METADOCU_EVIDENCE, 0)).toEqual(['P1', 'P2', 'P5'])
    const withoutPsi = METADOCU_EVIDENCE.filter((e) => e.type !== 'psi')
    expect(pillarsWithData(withoutPsi, 0)).toContain('P1')
  })

  it('returns pillars in canonical P1..P5 order regardless of input order', () => {
    const ua = ev('ua_probe', { crawlers: [{ ua: 'GPTBot', kind: 'training', url: 'https://example.com/', status: 200, blocked: false }], llmsTxt: { exists: false, url: 'https://example.com/llms.txt' } })
    const gsc = ev('gsc', { dimension: 'query', rows: [{ keys: ['x'], clicks: 1, impressions: 3, ctr: 0.3, position: 4 }] })
    expect(pillarsWithData([ua, gsc, ev('schema'), ev('site_audit')], 0)).toEqual(['P1', 'P2', 'P3', 'P5'])
  })

  it('ignores unknown evidence types; empty input → []', () => {
    expect(pillarsWithData([ev('unknown_type')], 0)).toEqual([])
    expect(pillarsWithData([], 0)).toEqual([])
  })
})

describe('evidenceUsable', () => {
  it('payload 为 null 或空对象 → 不可用', () => {
    expect(evidenceUsable('schema', null)).toBe(false)
    expect(evidenceUsable('schema', {})).toBe(false)
    expect(evidenceUsable('schema', { types: ['Organization'] })).toBe(true)
  })
  it('psi 只有在 CrUX 有现场数据或 Lighthouse 有分数时可用', () => {
    expect(evidenceUsable('psi', PSI_FAILED_AS_COLLECTED_PAYLOAD)).toBe(false)
    expect(evidenceUsable('psi', { ...PSI_FAILED_AS_COLLECTED_PAYLOAD, lighthouse: { opportunities: [], performanceScore: 0, ttfbMs: null } })).toBe(true)
  })
})

describe('可用性按类型判定（第二波审查 I2 / I3 / I5）', () => {
  it('GSC 证据一行数据都没有（新站或国家过滤无数据）→ 不让 P3 入分（没有可评估的数据，不能给 100 分）', () => {
    const empty = [ev('gsc', { dimension: 'query', rows: [], avgPosition: null }), ev('gsc', { dimension: 'queryPage', rows: [] })]
    expect(pillarsWithData(empty, 0)).toEqual([])
    expect(pillarsWithData([ev('gsc', { dimension: 'query', rows: [{ keys: ['remove exif'], clicks: 1, impressions: 20, ctr: 0.05, position: 9 }] })], 0)).toEqual(['P3'])
  })
  it('UA 探测每个请求都失败（status 全为 null）→ 不可用；有任一真实状态码 → 可用', () => {
    const crawler = (status: number | null) => ({ ua: 'GPTBot', kind: 'training', url: 'https://example.com/', status, blocked: false })
    expect(evidenceUsable('ua_probe', { crawlers: [crawler(null), crawler(null)], llmsTxt: { exists: false, url: 'https://example.com/llms.txt' } })).toBe(false)
    expect(evidenceUsable('ua_probe', { crawlers: [crawler(null), crawler(200)], llmsTxt: { exists: false, url: 'https://example.com/llms.txt' } })).toBe(true)
  })
  it('第三方语料：v2 至少一路 ok 才可用；v1 旧载荷只有 Reddit 正数提及可信（维基是全文搜索、0 条可能是 403）', () => {
    const wikiFailed = { status: 'failed', httpStatus: 503, reason: 'http_503' }
    const redditFailed = { status: 'failed', httpStatus: 403, reason: 'http_403', windowDays: 365 }
    expect(evidenceUsable('third_party_presence', { version: 2, candidates: ['Example'], wikipedia: wikiFailed, reddit: redditFailed })).toBe(false)
    expect(evidenceUsable('third_party_presence', { version: 2, candidates: ['Example'], wikipedia: { status: 'ok', exists: false, title: null, url: null }, reddit: redditFailed })).toBe(true)
    expect(evidenceUsable('third_party_presence', { reddit: { mentions: 0, windowDays: 365 }, wikipedia: { exists: false, title: null, url: null } })).toBe(false)
    expect(evidenceUsable('third_party_presence', { reddit: { mentions: 4, windowDays: 365 }, wikipedia: { exists: false, title: null, url: null } })).toBe(true)
  })
})
