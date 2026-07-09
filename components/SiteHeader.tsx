import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { LocaleSwitch } from './LocaleSwitch'
import { DataSourceHealth } from './DataSourceHealth'
import { loadDataSourceStatuses } from '@/lib/settings/load-statuses'
import { summarizeDataSourceHealth } from '@/lib/settings/data-source-health'
import type { DataSourceHealth as DataSourceHealthSummary } from '@/lib/settings/data-source-health'

// 全站顶部导航（design spec §1.1，2026-07-08）：品牌 + 「项目/规则库/设置」+ 新建分析 CTA
// + 数据源健康度 pill + 语言切换。Server Component，统一渲染于 app/[locale]/layout.tsx，
// 替代过去每页各自 import Shell 才有导航的机制（/rules 曾因此漏包成为孤岛）。
// 数据源健康度取全局视角（不传 projectId）：GSC「去连接」回落到 /settings#source-gsc 锚点。
export async function SiteHeader({ locale }: { locale: string }) {
  const [t, dataHealth] = await Promise.all([
    getTranslations('nav'),
    loadDataSourceStatuses().then(summarizeDataSourceHealth),
  ])

  return (
    <SiteHeaderView
      locale={locale}
      dataHealth={dataHealth}
      labels={{
        projects: t('projects'),
        rules: t('rules'),
        settings: t('settings'),
        newAnalysis: t('newAnalysis'),
      }}
    />
  )
}

// 纯展示部分拆成同步子组件，便于单测（不依赖 next-intl/server 的 async 数据获取）。
// LocaleSwitch / DataSourceHealth 仍是各自的 client leaf，本组件自身无需 'use client'。
export function SiteHeaderView({
  locale,
  labels,
  dataHealth,
}: {
  locale: string
  labels: { projects: string; rules: string; settings: string; newAnalysis: string }
  dataHealth: DataSourceHealthSummary
}) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={`/${locale}/`} className="brand">
          <span className="logo">
            Ver<b>i</b>s
          </span>
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
          <DataSourceHealth
            items={dataHealth.items}
            up={dataHealth.up}
            total={dataHealth.total}
            locale={locale}
          />
          <LocaleSwitch />
          <Link href={`/${locale}/new`} className="run-btn">
            {labels.newAnalysis}
          </Link>
        </div>
      </div>
    </header>
  )
}
