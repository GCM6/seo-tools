import Link from 'next/link'
import type { ReactNode } from 'react'

// 非诊断页的页头（design-system §4 PageHeader）：面包屑（可选）+ 唯一的 h1 + 一句说明 + 右侧动作。
// 动作最多 1 个 primary + 2 个 secondary，由调用方保证。i18n-free。
export function PageHeader({
  title,
  description,
  crumbs,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  crumbs?: { label: string; href?: string }[]
  actions?: ReactNode
}) {
  return (
    <header className="ui-page-head">
      <div className="ui-page-head__main">
        {crumbs && crumbs.length > 0 ? (
          <nav className="ui-crumbs" aria-label="breadcrumb">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="contents">
                {i > 0 ? <span aria-hidden="true">/</span> : null}
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="ui-page-head__title">{title}</h1>
        {description ? <p className="ui-page-head__desc">{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-head__actions">{actions}</div> : null}
    </header>
  )
}
