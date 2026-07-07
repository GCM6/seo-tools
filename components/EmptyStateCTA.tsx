import Link from 'next/link'
import type { ReactNode } from 'react'

// 标准空态组件：把「一片空白的 pending 块」变成「一条出路」。
// i18n-free 纯展示（照 ProvenanceTag 约定）——调用方 t() 后传入已翻译字符串，
// 可直接用于 Server Component。图标 + 标题（缺少 X 数据源）+ 影响一句话 + 主按钮。
// （spec §SP-G2b-3）
export function EmptyStateCTA({
  title,
  impact,
  actionLabel,
  href,
  icon,
}: {
  title: string
  impact: string
  actionLabel: string
  href: string
  icon?: ReactNode
}) {
  return (
    <div className="card empty-cta">
      <div className="empty-cta-icon" aria-hidden>
        {icon ?? '○'}
      </div>
      <div className="empty-cta-body">
        <div className="empty-cta-title">{title}</div>
        <p className="empty-cta-impact">{impact}</p>
      </div>
      <Link href={href} className="empty-cta-action">
        {actionLabel}
      </Link>
    </div>
  )
}
