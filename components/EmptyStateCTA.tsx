import { ButtonLink } from './Button'
import { EmptyState } from './EmptyState'

// 「缺少某数据源」类空态：标题（缺什么）+ 一句影响 + 一个去配置的动作（spec §SP-G2b-3）。
// 现由统一的 EmptyState 组件渲染（design-system §4 EmptyState），不再有圆圈图标和独立样式。
// i18n-free 纯展示（照 EvidenceBadge 约定）——调用方 t() 后传入已翻译字符串，可直接用于 Server Component。
export function EmptyStateCTA({
  title,
  impact,
  actionLabel,
  href,
}: {
  title: string
  impact: string
  actionLabel: string
  href: string
}) {
  return (
    <div className="ui-panel">
      <EmptyState
        title={title}
        description={impact}
        action={
          <ButtonLink href={href} size="sm">
            {actionLabel}
          </ButtonLink>
        }
      />
    </div>
  )
}
