import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { LocaleSwitch } from './LocaleSwitch'
import { Stepper } from './Stepper'
import { DataSourceHealth } from './DataSourceHealth'
import type { DataSourceHealth as DataSourceHealthSummary } from '@/lib/settings/data-source-health'

// App chrome: top bar (brand + tagline + target domain + locale switch) above
// the workflow Stepper, then the screen content. Server Component — the only
// client leaves are <Stepper>, <LocaleSwitch> and (opt-in) <DataSourceHealth>.
// dataHealth 由诊断相关页预算好传入（设置页本身即目的地，不挂 pill）；Shell 不碰 DB。
// （spec §SP-G2b-5）
export async function Shell({
  active,
  locale,
  runId,
  domain,
  dataHealth,
  children,
}: {
  active: 1 | 2 | 3 | 4
  locale: string
  runId?: string
  domain?: string
  dataHealth?: DataSourceHealthSummary | null
  children: ReactNode
}) {
  const t = await getTranslations('common')

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <span className="logo">
            Ver<b>i</b>s
          </span>
          <span className="sub">{t('tagline')}</span>
        </div>
        <div className="target">
          {domain ? (
            <>
              <span>{t('targetLabel')}</span>
              <span className="dom mono">{domain}</span>
            </>
          ) : null}
          {dataHealth ? (
            <DataSourceHealth
              items={dataHealth.items}
              up={dataHealth.up}
              total={dataHealth.total}
              locale={locale}
            />
          ) : null}
          <Link href={`/${locale}/settings`} className="settings-link">{t('settingsLink')}</Link>
          <LocaleSwitch />
        </div>
      </div>

      <Stepper active={active} runId={runId} locale={locale} />

      {children}
    </div>
  )
}
