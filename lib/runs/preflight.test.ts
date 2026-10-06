import { describe, it, expect } from 'vitest'
import { buildPreflight, preflightBlocks, preflightGaps, type PreflightProbe } from './preflight'

const allGood: PreflightProbe = {
  categoryValid: true, marketValid: true,
  gsc: { platformConfigured: true, connected: true, siteSelected: true, tokenOk: true },
  dataforseo: { hasCredentials: true, authOk: true, balance: 12.3 },
  psi: { hasKey: true }, render: { configured: true },
  ai: { engines: [{ provider: 'openai', webSearch: true }] },
}
const itemOf = (p: PreflightProbe, source: string) => buildPreflight(p).find((i) => i.source === source)

describe('buildPreflight（SP-A §4.5）', () => {
  it('全部就绪：每项 ready、不影响任何维度；DataForSEO 带余额', () => {
    const items = buildPreflight(allGood)
    expect(items.map((i) => i.source)).toEqual(['project', 'gsc', 'dataforseo', 'psi', 'render', 'ai_probe'])
    expect(items.every((i) => i.state === 'ready' && i.affects.length === 0)).toBe(true)
    expect(itemOf(allGood, 'dataforseo')?.detail).toEqual({ balance: 12.3 })
  })

  it('GSC token 失效（invalid_grant）→ unavailable + 重新授权，影响排名与关键词', () => {
    expect(itemOf({ ...allGood, gsc: { ...allGood.gsc, tokenOk: false, tokenError: 'invalid_grant' } }, 'gsc')).toMatchObject({
      state: 'unavailable', reason: 'gsc_token_invalid', affects: ['rankings', 'keywords'], fix: { action: 'reauth_gsc' },
    })
  })

  it('GSC 刷新遇到网络错误（tokenOk 为 null 且有错误）→ degraded gsc_unreachable，而不是当成就绪', () => {
    expect(itemOf({ ...allGood, gsc: { ...allGood.gsc, tokenOk: null, tokenError: 'fetch failed' } }, 'gsc')).toMatchObject({
      state: 'degraded', reason: 'gsc_unreachable',
    })
  })

  it('GSC 已连接但未选站点 → unavailable gsc_site_missing', () => {
    expect(itemOf({ ...allGood, gsc: { ...allGood.gsc, siteSelected: false } }, 'gsc')).toMatchObject({
      state: 'unavailable', reason: 'gsc_site_missing', fix: { action: 'select_gsc_site' },
    })
  })

  it('DataForSEO：无凭据 / 401 → unavailable；网络错误 → degraded', () => {
    expect(itemOf({ ...allGood, dataforseo: { hasCredentials: false, authOk: null } }, 'dataforseo')).toMatchObject({ state: 'unavailable', reason: 'dfs_no_credentials' })
    expect(itemOf({ ...allGood, dataforseo: { hasCredentials: true, authOk: false, error: 'http_401' } }, 'dataforseo')).toMatchObject({ state: 'unavailable', reason: 'dfs_auth_failed' })
    expect(itemOf({ ...allGood, dataforseo: { hasCredentials: true, authOk: null, error: 'network_error' } }, 'dataforseo')).toMatchObject({ state: 'degraded', reason: 'dfs_unreachable' })
  })

  it('只有记忆型引擎 → degraded ai_memory_only；一个都没有 → unavailable', () => {
    expect(itemOf({ ...allGood, ai: { engines: [{ provider: 'deepseek', webSearch: false }] } }, 'ai_probe')).toMatchObject({ state: 'degraded', reason: 'ai_memory_only', affects: ['geo'] })
    expect(itemOf({ ...allGood, ai: { engines: [] } }, 'ai_probe')).toMatchObject({ state: 'unavailable', reason: 'ai_not_configured' })
  })

  it('无 PSI key → degraded psi_no_key（匿名调用可能被限流）；未配渲染 → unavailable', () => {
    expect(itemOf({ ...allGood, psi: { hasKey: false } }, 'psi')).toMatchObject({ state: 'degraded', reason: 'psi_no_key', affects: ['technical'] })
    expect(itemOf({ ...allGood, render: { configured: false } }, 'render')).toMatchObject({ state: 'unavailable', reason: 'render_not_configured' })
  })

  it('品类或市场无效 → project unavailable，且阻断运行；其他缺口不阻断', () => {
    expect(preflightBlocks(buildPreflight({ ...allGood, categoryValid: false }))).toBe(true)
    expect(preflightBlocks(buildPreflight({ ...allGood, marketValid: false }))).toBe(true)
    expect(preflightBlocks(buildPreflight({ ...allGood, render: { configured: false }, psi: { hasKey: false } }))).toBe(false)
  })
})

describe('preflightGaps：面板顶部"无法评估 / 评估受限"的维度清单', () => {
  it('不可用项与降级项分开汇总、去重；降级维度不重复列入不可用里已有的维度', () => {
    const items = buildPreflight({
      ...allGood,
      gsc: { ...allGood.gsc, tokenOk: false, tokenError: 'invalid_grant' },
      psi: { hasKey: false },
      ai: { engines: [{ provider: 'deepseek', webSearch: false }] },
    })
    expect(preflightGaps(items)).toEqual({ unavailable: ['rankings', 'keywords'], degraded: ['technical', 'geo'] })
  })
  it('全部就绪 → 两个清单都为空', () => {
    expect(preflightGaps(buildPreflight(allGood))).toEqual({ unavailable: [], degraded: [] })
  })
})
