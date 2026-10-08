import type { ReactNode } from 'react'

// 结果表（design-system §4 ResultTable）：检测项目 / 结果 / 说明 / 证据。
// 同步、i18n-free 的纯展示组件：概览页（KeyResults，带「去连接」和原始数据）与报告文档
// （ReportView，客户可见，不带站内链接）各自算好行再交给它，保证两处同一种外观。
export interface ResultRow {
  key: string
  label: string
  value: ReactNode
  /** 未接入 / 本轮未测量：结果列用弱化色，不冒充测量值。 */
  muted?: boolean
  note: string
  evidence?: ReactNode
  /** 行下方的展开内容（如原始数据）。 */
  detail?: ReactNode
}

export function ResultTable({
  rows,
  head,
}: {
  rows: ResultRow[]
  head: { item: string; result: string; note: string; evidence: string }
}) {
  return (
    <div className="ui-panel ui-result">
      <div className="ui-result__row ui-result__head" aria-hidden="true">
        <span>{head.item}</span>
        <span>{head.result}</span>
        <span>{head.note}</span>
        <span>{head.evidence}</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="ui-result__row">
          <span className="ui-result__label">{r.label}</span>
          <span className={r.muted ? 'ui-result__value ui-result__value--muted' : 'ui-result__value'}>{r.value}</span>
          <span className="ui-result__note">{r.note}</span>
          <span className="ui-result__ev">{r.evidence}</span>
          {r.detail}
        </div>
      ))}
    </div>
  )
}
