import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { ButtonLink } from './Button'
import { LocaleSwitch } from './LocaleSwitch'
import { Logo } from './Logo'
import { MobileNav } from './MobileNav'
import { ThemeToggle } from './ThemeToggle'
import { TopNav } from './TopNav'
import { navItems, type SiteHeaderLabels } from './siteNav'

// 全站顶栏（design-system §4 TopBar / ux-blueprint §0）：Logo · 项目 / 规则库 / 知识库 / 设置 ·
// 语言 · 主题 · 新建分析。手机上主导航和动作收进菜单抽屉。
// Server Component，统一渲染于 app/[locale]/layout.tsx。
export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations('nav')

  return (
    <SiteHeaderView
      locale={locale}
      labels={{
        projects: t('projects'),
        rules: t('rules'),
        knowledge: t('knowledge'),
        settings: t('settings'),
        newAnalysis: t('newAnalysis'),
        menuTitle: t('menuTitle'),
        themeMode: t('themeMode'),
        language: t('language'),
      }}
    />
  )
}

// 纯展示部分拆成同步子组件，便于单测（不依赖 next-intl/server 的 async 数据获取）。
export function SiteHeaderView({ locale, labels }: { locale: string; labels: SiteHeaderLabels }) {
  return (
    <header className="ui-top">
      <div className="ui-top__in">
        <Link href={`/${locale}/`} className="ui-logo" aria-label="Veris Home">
          <Logo />
        </Link>
        <TopNav variant="bar" items={navItems(locale, labels)} />
        <div className="ui-top__actions">
          <LocaleSwitch />
          <ThemeToggle />
          <ButtonLink href={`/${locale}/new`} variant="primary">
            {labels.newAnalysis}
          </ButtonLink>
        </div>
        <div className="ui-top__menu">
          <MobileNav locale={locale} labels={labels} />
        </div>
      </div>
    </header>
  )
}
