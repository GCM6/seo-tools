import { preflightGaps, type Dimension, type PreflightItem } from '@/lib/runs/preflight'

// 运行前预检面板（SP-A §4.5，向导第 2 步）。纯展示：不调 hook，文案由调用方 t() 解析后传入，
// 修复链接由调用方按 locale / 项目拼好（fixHref 返回 null 则不渲染链接）。
export interface PreflightPanelLabels {
  title: string
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
  if (status === 'loading') return <section className="preflight" aria-label={labels.title}><p className="wizard-hint">{labels.loading}</p></section>
  if (status === 'error' || !items) return <section className="preflight" aria-label={labels.title}><p role="alert" className="wizard-hint">{labels.failed}</p></section>

  const gaps = preflightGaps(items)
  const names = (dims: Dimension[]) => dims.map((d) => labels.dimensions[d])
  return (
    <section className="preflight" aria-label={labels.title}>
      <div className="cc-title">{labels.title}</div>
      {gaps.unavailable.length > 0 && <p className="preflight-gap unavailable">{labels.unavailableSummary(names(gaps.unavailable))}</p>}
      {gaps.degraded.length > 0 && <p className="preflight-gap degraded">{labels.degradedSummary(names(gaps.degraded))}</p>}
      {gaps.unavailable.length === 0 && gaps.degraded.length === 0 && <p className="preflight-gap ready">{labels.allReady}</p>}
      <ul className="preflight-list">
        {items.map((item) => {
          const href = item.fix ? fixHref(item) : null
          const balance = item.source === 'dataforseo' && typeof item.detail?.balance === 'number' ? item.detail.balance : null
          return (
            <li key={item.source} className={`preflight-item ${item.state}`}>
              <span className="pf-source">{labels.sources[item.source] ?? item.source}</span>
              <span className={`pf-state ${item.state}`}>{labels.states[item.state]}</span>
              {item.reason && <span className="pf-reason">{labels.reasons[item.reason] ?? item.reason}</span>}
              {balance !== null && <span className="pf-reason">{labels.balance(balance)}</span>}
              {href && item.fix && <a className="cc-action" href={href}>{labels.fixes[item.fix.action]}</a>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
