import type { ReactNode } from 'react'

// 事实栏：报告抬头式的 dl 网格（design-system §4 Facts）。诊断页抬头和分享报告抬头共用。
// mono=true 只用于字面数据（协议、规则版本、报告编号）。i18n-free。
export interface FactItem {
  label: string
  value: ReactNode
  mono?: boolean
}

export function Facts({ items }: { items: FactItem[] }) {
  return (
    <dl className="ui-facts">
      {items.map((it) => (
        <div key={it.label}>
          <dt>{it.label}</dt>
          <dd className={it.mono ? 'ui-mono' : 'ui-num'}>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
