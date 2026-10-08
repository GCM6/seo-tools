import type { ReactNode } from 'react'

// 汇总数字格（ux-blueprint §3.6「汇总数字」）：一行若干个「标签 + 数字」。
// warn = 这是一个「越多越糟」的计数且当前大于 0：数字改用警示色，并在标签前加方块标记，
// 不只靠颜色区分（design-system §3.2）。i18n-free、无 hook，可用于 Server Component。
export interface StatItem {
  key: string
  label: ReactNode
  value: ReactNode
  warn?: boolean
}

export function StatGrid({ items, ariaLabel }: { items: StatItem[]; ariaLabel?: string }) {
  return (
    <dl className="ui-stats" aria-label={ariaLabel}>
      {items.map((it) => (
        <div key={it.key} className={it.warn ? 'ui-stat ui-stat--warn' : 'ui-stat'}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
