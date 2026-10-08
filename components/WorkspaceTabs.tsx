import Link from 'next/link'

// 诊断视图导航（design-system §4 WorkspaceTabs）：主视图 + 右侧「原始数据」链接组。
// 当前项由页面传入（服务端已知），不需要 client hook；当前项 aria-current + 2px 强调色下划线。i18n-free。
export type WorkspaceView = 'overview' | 'issues' | 'recs' | 'exec' | 'report' | 'site' | 'keywords' | 'competitors' | 'facts'

export interface WorkspaceTabItem {
  view: WorkspaceView
  href: string
  label: string
  count?: string
}

export function WorkspaceTabs({
  current,
  main,
  aside,
  asideLabel,
  ariaLabel,
}: {
  current: WorkspaceView
  main: WorkspaceTabItem[]
  aside: WorkspaceTabItem[]
  asideLabel: string
  ariaLabel: string
}) {
  return (
    <nav className="ui-tabs" aria-label={ariaLabel}>
      <ul className="ui-tabs__list">
        {main.map((it) => (
          <li key={it.view}>
            <Link href={it.href} className="ui-tabs__link" aria-current={it.view === current ? 'page' : undefined}>
              {it.label}
              {it.count ? <span className="ui-tabs__count">{it.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      <div className="ui-tabs__aside">
        <span className="ui-tabs__aside-label">{asideLabel}</span>
        {aside.map((it) => (
          <Link key={it.view} href={it.href} aria-current={it.view === current ? 'page' : undefined}>
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
