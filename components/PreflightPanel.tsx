import { preflightGaps, type Dimension, type PreflightItem } from '@/lib/runs/preflight'
import { SeverityMark, type SeverityLevel } from './SeverityMark'

// 运行前预检面板（SP-A §4.5，向导第 2 步）。纯展示：不调 hook，文案由调用方 t() 解析后传入，
// 修复链接由调用方按 locale / 项目拼好（fixHref 返回 null 则不渲染链接）。
export interface PreflightPanelLabels {
  title: string
  /** GSC 从没连接过时，修复入口写「连接」而不是「重新授权」；缺省沿用 fixes.reauth_gsc。 */
  connectGsc?: string
  loading: string
  failed: string
  allReady: string
  // 参数是已翻译的维度名，由调用方按语言拼接（中文用"、"，英文用", "）。
  unavailableSummary: (dims: string[]) => string
  degradedSummary: (dims: string[]) => string
  balance: (balance: number) => string
  states: Record<PreflightItem['state'], string>
  sources: Record<string, string>
  reasons: Record<string, string>
  fixes: Record<NonNullable<PreflightItem['fix']>['action'], string>
  dimensions: Record<Dimension, string>
}

// 数据源状态用严重度标记的形状区分（design-system §3.2）：可用 ✓ / 受限 琥珀方块 / 不可用 红方块。
const STATE_LEVEL: Record<PreflightItem['state'], SeverityLevel> = { ready: 'pass', degraded: 'mid', unavailable: 'high' }

export function PreflightPanel({
  status,
  items,
  labels,
  fixHref,
}: {
  status: 'loading' | 'error' | 'done'
  items: PreflightItem[] | null
  labels: PreflightPanelLabels
  fixHref: (item: PreflightItem) => string | null
}) {
  if (status === 'loading' || status === 'error' || !items) {
    return (
      <section className="ui-preflight" aria-label={labels.title}>
        {status === 'loading' ? (
          <p className="ui-hint">{labels.loading}</p>
        ) : (
          <p role="alert" className="ui-hint">
            {labels.failed}
          </p>
        )}
      </section>
    )
  }

  const fixText = (action: NonNullable<PreflightItem['fix']>['action'], reason: string | null) =>
    action === 'reauth_gsc' && reason === 'gsc_not_connected' && labels.connectGsc ? labels.connectGsc : labels.fixes[action]
  const gaps = preflightGaps(items)
  const names = (dims: Dimension[]) => dims.map((d) => labels.dimensions[d])
  return (
    <section className="ui-preflight" aria-label={labels.title}>
      <h3 className="ui-subhead">{labels.title}</h3>
      {gaps.unavailable.length > 0 ? <p className="ui-preflight__gap">{labels.unavailableSummary(names(gaps.unavailable))}</p> : null}
      {gaps.degraded.length > 0 ? <p className="ui-preflight__gap">{labels.degradedSummary(names(gaps.degraded))}</p> : null}
      {gaps.unavailable.length === 0 && gaps.degraded.length === 0 ? <p className="ui-preflight__gap">{labels.allReady}</p> : null}
      <ul className="ui-preflight__list">
        {items.map((item) => {
          const href = item.fix ? fixHref(item) : null
          const balance = item.source === 'dataforseo' && typeof item.detail?.balance === 'number' ? item.detail.balance : null
          return (
            <li key={item.source} className="ui-preflight__item">
              <span className="ui-preflight__source">{labels.sources[item.source] ?? item.source}</span>
              <SeverityMark level={STATE_LEVEL[item.state]} label={labels.states[item.state]} />
              <span className="ui-preflight__reason">
                {item.reason ? <span>{labels.reasons[item.reason] ?? item.reason}</span> : null}
                {balance !== null ? <span>{labels.balance(balance)}</span> : null}
              </span>
              {href && item.fix ? <a href={href}>{fixText(item.fix.action, item.reason)}</a> : <span />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
