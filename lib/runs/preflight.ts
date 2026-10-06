// 运行前预检（SP-A §4.5）：纯逻辑——输入各数据源的探测结果，输出预检项清单。实际探测见 preflight-probe.ts。
// 除品类与市场外，预检不阻断运行：带着缺口照常检测，采集流水线会如实写出失败原因。

export type Dimension =
  | 'eeat' | 'content' | 'structured_data' | 'site_type' | 'rich_results'
  | 'rankings' | 'keywords' | 'technical' | 'geo' | 'competitors' | 'backlinks'

export interface PreflightItem {
  source: string // 与 §4.2 的父键一致（project 除外）
  state: 'ready' | 'degraded' | 'unavailable'
  reason: string | null
  affects: Dimension[] // 这一项不可用/降级时，哪些维度无法（完整）评估
  fix: { action: 'reauth_gsc' | 'select_gsc_site' | 'configure_key' | 'edit_project'; href: string } | null
  detail?: Record<string, unknown>
}

export interface PreflightProbe {
  categoryValid: boolean
  marketValid: boolean
  // tokenOk：true 刷新成功；false 授权失效（invalid_grant）；null 未检查或刷新时网络出错（看 tokenError）。
  gsc: { platformConfigured: boolean; connected: boolean; siteSelected: boolean; tokenOk: boolean | null; tokenError?: string }
  // authOk：true 账户接口通过；false 凭据被拒（401）；null 网络错误等无法判定。
  dataforseo: { hasCredentials: boolean; authOk: boolean | null; balance?: number | null; error?: string }
  psi: { hasKey: boolean }
  render: { configured: boolean }
  ai: { engines: { provider: string; webSearch: boolean }[] }
}

const ALL_DIMENSIONS: Dimension[] = [
  'eeat', 'content', 'structured_data', 'site_type', 'rich_results', 'rankings', 'keywords', 'technical', 'geo', 'competitors', 'backlinks',
]

// 各数据源影响的维度（spec §4.5）。
const AFFECTS: Record<string, Dimension[]> = {
  project: ALL_DIMENSIONS,
  gsc: ['rankings', 'keywords'],
  dataforseo: ['keywords', 'competitors', 'backlinks', 'geo'],
  psi: ['technical'],
  render: ['technical', 'structured_data'],
  ai_probe: ['geo'],
}

export function buildPreflight(p: PreflightProbe): PreflightItem[] {
  const item = (
    source: string,
    state: PreflightItem['state'],
    reason: string | null,
    fix: PreflightItem['fix'] = null,
    detail?: Record<string, unknown>,
  ): PreflightItem => ({ source, state, reason, affects: state === 'ready' ? [] : AFFECTS[source], fix, ...(detail ? { detail } : {}) })

  const items: PreflightItem[] = []
  items.push(!p.categoryValid ? item('project', 'unavailable', 'category_invalid', { action: 'edit_project', href: '#wiz-category' })
    : !p.marketValid ? item('project', 'unavailable', 'market_invalid', { action: 'edit_project', href: '#wiz-market' })
    : item('project', 'ready', null))

  const g = p.gsc
  items.push(!g.platformConfigured ? item('gsc', 'unavailable', 'gsc_not_configured', { action: 'configure_key', href: '/settings' })
    : !g.connected ? item('gsc', 'unavailable', 'gsc_not_connected', { action: 'reauth_gsc', href: '/api/gsc/auth' })
    : !g.siteSelected ? item('gsc', 'unavailable', 'gsc_site_missing', { action: 'select_gsc_site', href: '/settings' })
    : g.tokenOk === false ? item('gsc', 'unavailable', 'gsc_token_invalid', { action: 'reauth_gsc', href: '/api/gsc/auth' }, { error: g.tokenError })
    // 刷新时网络出错：授权未必失效，但本次能否拿到数据不确定——降级，不当成就绪。
    : g.tokenOk === null && g.tokenError ? item('gsc', 'degraded', 'gsc_unreachable', null, { error: g.tokenError })
    : item('gsc', 'ready', null))

  const d = p.dataforseo
  items.push(!d.hasCredentials ? item('dataforseo', 'unavailable', 'dfs_no_credentials', { action: 'configure_key', href: '/settings' })
    : d.authOk === false ? item('dataforseo', 'unavailable', 'dfs_auth_failed', { action: 'configure_key', href: '/settings' }, { error: d.error })
    : d.authOk === null ? item('dataforseo', 'degraded', 'dfs_unreachable', null, { error: d.error })
    : item('dataforseo', 'ready', null, null, { balance: d.balance ?? null }))

  items.push(p.psi.hasKey ? item('psi', 'ready', null) : item('psi', 'degraded', 'psi_no_key', { action: 'configure_key', href: '/settings' }))
  items.push(p.render.configured ? item('render', 'ready', null) : item('render', 'unavailable', 'render_not_configured', { action: 'configure_key', href: '/settings' }))

  const engines = p.ai.engines
  items.push(engines.length === 0 ? item('ai_probe', 'unavailable', 'ai_not_configured', { action: 'configure_key', href: '/settings' })
    : engines.every((e) => !e.webSearch) ? item('ai_probe', 'degraded', 'ai_memory_only', { action: 'configure_key', href: '/settings' }, { engines })
    : item('ai_probe', 'ready', null, null, { engines }))
  return items
}

// 只有品类/市场无效会阻断运行（建 run 闸门同口径）。
export const preflightBlocks = (items: PreflightItem[]): boolean =>
  items.some((i) => i.source === 'project' && i.state === 'unavailable')

// 面板顶部汇总：不可用维度（本次无法评估）与降级维度（本次评估受限）分开列出、去重；
// 已在不可用里的维度不再重复列入降级。顺序按维度表。
export function preflightGaps(items: PreflightItem[]): { unavailable: Dimension[]; degraded: Dimension[] } {
  const unavailable = new Set(items.filter((i) => i.state === 'unavailable').flatMap((i) => i.affects))
  const degraded = new Set(items.filter((i) => i.state === 'degraded').flatMap((i) => i.affects).filter((d) => !unavailable.has(d)))
  return {
    unavailable: ALL_DIMENSIONS.filter((d) => unavailable.has(d)),
    degraded: ALL_DIMENSIONS.filter((d) => degraded.has(d)),
  }
}
