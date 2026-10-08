import type { ReactNode } from 'react'

// 全站唯一的空状态（design-system §4 EmptyState）：标题 + 一句原因 + 最多 1 个动作，
// 居左，不放插画和大图标。取代 .pending-block、把 .note 当空状态等旧写法。i18n-free。
export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="ui-empty">
      <p className="ui-empty__title">{title}</p>
      {description ? <p className="ui-empty__desc">{description}</p> : null}
      {action ? <div className="ui-empty__action">{action}</div> : null}
    </div>
  )
}
