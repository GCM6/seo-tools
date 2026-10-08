'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// 顶栏主导航（client 叶子）：只为了按当前路径给对应项加 aria-current（design-system §4 TopBar）。
// 子路由也算当前项：/zh/projects/xxx 高亮「项目」。i18n-free，文案由 SiteHeader 传入。
export function isCurrentSection(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function TopNav({
  items,
  variant,
  onNavigate,
}: {
  items: { href: string; label: string }[]
  variant: 'bar' | 'menu'
  /** 手机菜单里点链接后关闭抽屉。 */
  onNavigate?: () => void
}) {
  const pathname = usePathname() ?? ''
  const linkClass = variant === 'bar' ? 'ui-top__link' : 'ui-menu__link'
  return (
    <nav className={variant === 'bar' ? 'ui-top__nav' : 'ui-menu__nav'} aria-label="Primary">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={linkClass}
          aria-current={isCurrentSection(pathname, it.href) ? 'page' : undefined}
          onClick={onNavigate}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  )
}
