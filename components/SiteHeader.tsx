import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { LocaleSwitch } from './LocaleSwitch'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { MobileNav } from './MobileNav'

// 全站顶部导航（design spec §1.1，2026-07-08）：品牌 + 「项目/规则库/设置」+ 新建分析 CTA
// + 语言切换。项目级 GSC 不在全局顶栏展示，避免把任一项目的授权误读成全局就绪。
// Server Component，统一渲染于 app/[locale]/layout.tsx，
// 替代过去每页各自 import Shell 才有导航的机制（/rules 曾因此漏包成为孤岛）。
export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations('nav')

  return (
    <SiteHeaderView
      locale={locale}
      labels={{
        projects: t('projects'),
        rules: t('rules'),
        settings: t('settings'),
        newAnalysis: t('newAnalysis'),
        menuTitle: t('menuTitle'),
        themeMode: t('themeMode'),
      }}
    />
  )
}

// 纯展示部分拆成同步子组件，便于单测（不依赖 next-intl/server 的 async 数据获取）。
// LocaleSwitch 是 client leaf，本组件自身无需 'use client'。
export function SiteHeaderView({
  locale,
  labels,
}: {
  locale: string
  labels: {
    projects: string
    rules: string
    settings: string
    newAnalysis: string
    menuTitle: string
    themeMode: string
  }
}) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={`/${locale}/`} className="brand" aria-label="Veris Home">
          <Logo />
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href={`/${locale}/projects`} className="nav-link">
            {labels.projects}
          </Link>
          <Link href={`/${locale}/rules`} className="nav-link">
            {labels.rules}
          </Link>
          <Link href={`/${locale}/settings`} className="nav-link">
            {labels.settings}
          </Link>
        </nav>
        <div className="site-header-actions">
          <LocaleSwitch />
          <ThemeToggle />
          <Link href={`/${locale}/new`} className="run-btn">
            {labels.newAnalysis}
          </Link>
        </div>

        {/* 移动端汉堡包抽屉组件 */}
        <div className="mobile-nav-trigger">
          <MobileNav locale={locale} labels={labels} />
        </div>
      </div>
    </header>
  )
}
