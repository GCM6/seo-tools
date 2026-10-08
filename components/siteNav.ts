// 顶栏与手机菜单共用的导航项（同一组、同一顺序）。纯数据，不含 server-only 依赖，
// 供 Server Component（SiteHeader）与 Client Component（MobileNav）共同引用。
export interface SiteHeaderLabels {
  projects: string
  rules: string
  knowledge?: string
  settings: string
  newAnalysis: string
  menuTitle: string
  themeMode: string
  language?: string
}

export function navItems(locale: string, labels: SiteHeaderLabels) {
  return [
    { href: `/${locale}/projects`, label: labels.projects },
    { href: `/${locale}/rules`, label: labels.rules },
    { href: `/${locale}/knowledge`, label: labels.knowledge ?? 'Knowledge' },
    { href: `/${locale}/settings`, label: labels.settings },
  ]
}
