import type { ReactNode } from 'react'

// 区段标题：h2（19px/600）+ 右侧说明或一个链接动作（design-system §4 SectionHeader）。i18n-free。
export function SectionHeader({
  title,
  id,
  note,
  action,
  level = 2,
}: {
  title: ReactNode
  id?: string
  note?: ReactNode
  action?: ReactNode
  level?: 2 | 3
}) {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <div className="ui-sec-head">
      <Heading className="ui-sec-head__title" id={id}>
        {title}
      </Heading>
      {note ? <span className="ui-sec-head__note">{note}</span> : null}
      {action}
    </div>
  )
}
